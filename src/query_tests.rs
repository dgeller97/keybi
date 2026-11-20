use crate::{
    live,
    query::{self, Visual},
    storage::Table,
};
use serde_json::json;
use std::collections::HashMap;

#[tokio::test]
async fn selection_caption_distinguishes_no_rows_from_one_blank_and_quotes_text() {
    let ctx=datafusion::prelude::SessionContext::new();
    ctx.sql("CREATE VIEW t1 AS SELECT * FROM (VALUES ('A','O''Brien'),('A','O''Brien'),('B',NULL),('C','O''Brien'),('C',NULL)) d(c0,c1)")
        .await.unwrap().collect().await.unwrap();
    let table:Table=serde_json::from_value(json!({"id":"t1","name":"Dispatch","rows":5,
        "columns":[{"name":"Route","numeric":false},{"name":"Office","numeric":false}]})).unwrap();
    let tables=HashMap::from([("t1".into(),table)]);
    let field=json!({"t":"t1","c":1});
    let text=|value:&str|json!({"op":"formula","field":field,"tree":{"kind":"text","value":value}});
    let selected=json!({"op":"formula","field":field,"tree":{"kind":"selected","text":true,"fallback":text("Opción d'hoy")}});
    let caption=json!({"op":"formula","field":field,"tree":{"kind":"concat","left":text("Region · "),"right":selected}});
    for (route,value,label) in [("A",json!("O'Brien"),"Region · O'Brien"),("B",json!(null),"Region · "),
        ("C",json!("Opción d'hoy"),"Region · Opción d'hoy"),("absent",json!("Opción d'hoy"),"Region · Opción d'hoy")] {
        let visual=serde_json::from_value(json!({"groups":[],"metrics":[selected,caption],
            "filters":[{"field":{"t":"t1","c":0},"value":route}],"limit":1})).unwrap();
        let sql=query::plan(&tables,&[],&[],&visual).unwrap();
        let rows=crate::values(&ctx.sql(&sql).await.unwrap().collect().await.unwrap()).unwrap();
        assert_eq!(json!(rows),json!([[value,label]]));
    }
}

#[tokio::test]
async fn member_groups_preserve_distinct_blank_sentinel_and_validate_overlap() {
    let ctx=datafusion::prelude::SessionContext::new();
    ctx.sql("CREATE VIEW t1 AS SELECT * FROM (VALUES ('North',2),('O''Brien',5),(NULL,8),('(Blank)',16),('North',4)) d(c0,c1)")
        .await.unwrap().collect().await.unwrap();
    let table:Table=serde_json::from_value(json!({"id":"t1","name":"Locations","rows":5,
        "columns":[{"name":"Site","numeric":false},{"name":"Units","numeric":true}]})).unwrap();
    let tables=HashMap::from([("t1".into(),table)]);
    let grouped=json!({"t":"t1","c":2});
    let mut calc=json!({"op":"memberGroups","left":{"t":"t1","c":0},"field":grouped,"groups":[
        {"name":"L'équipe","members":["North","O'Brien"]},{"name":"Unknown","members":[null]}]});
    let visual=serde_json::from_value(json!({"groups":[grouped],"metrics":[{"op":"sum","field":{"t":"t1","c":1}}],"filters":[],"limit":20})).unwrap();
    for (other,expected) in [(json!(null),json!([["(Blank)",16],["L'équipe",11],["Unknown",8]])),(json!("Remaining"),json!([["L'équipe",11],["Remaining",16],["Unknown",8]]))] {
        calc["otherLabel"]=other;
        let sql=query::plan(&tables,&[],&[serde_json::from_value(calc.clone()).unwrap()],&visual).unwrap();
        let rows=crate::values(&ctx.sql(&sql).await.unwrap().collect().await.unwrap()).unwrap();
        assert_eq!(json!(rows),expected);
    }
    calc["groups"][1]["members"]=json!(["North"]);
    assert!(query::plan(&tables,&[],&[serde_json::from_value(calc).unwrap()],&visual).is_err());
}

#[tokio::test]
async fn physical_line_products_keep_duplicates_credits_and_blank_operands() {
    let ctx=datafusion::prelude::SessionContext::new();
    ctx.sql("CREATE VIEW t1 AS SELECT * FROM (VALUES ('A',2,10),('A',2,10),('B',-1,8),('B',0,9),('C',2,NULL)) d(c0,c1,c2)")
        .await.unwrap().collect().await.unwrap();
    let table:Table=serde_json::from_value(json!({"id":"t1","name":"Lines","rows":5,"columns":[
        {"name":"Site","numeric":false},{"name":"Qty","numeric":true},{"name":"Rate","numeric":true}]})).unwrap();
    let tables=HashMap::from([("t1".into(),table)]);
    let field=|c|json!({"t":"t1","c":c});
    let node=|op:&str,tree|json!({"op":op,"field":field(0),"tree":tree});
    let row=|c|json!({"op":"row","field":field(c)});
    let literal=|n|node("formula",json!({"kind":"literal","number":n}));
    let product=|a,b|node("formula",json!({"kind":"multiply","left":a,"right":b}));
    let price=node("rowsum",json!({"kind":"rowsum","value":product(row(1),row(2))}));
    let blank=literal(serde_json::Value::Null);
    let metrics=json!([price,product(blank.clone(),literal(json!(0))),node("formula",json!({"kind":"add","left":blank,"right":blank}))]);
    for (groups,expected) in [(json!([]),json!([[32.0,null,null]])),(json!([field(0)]),json!([["A",40.0,null,null],["B",-8.0,null,null],["C",null,null,null]]))] {
        let visual:Visual=serde_json::from_value(json!({"groups":groups,"metrics":metrics,"filters":[],"limit":25})).unwrap();
        let sql=query::plan(&tables,&[],&[],&visual).unwrap();
        let rows=crate::values(&ctx.sql(&sql).await.unwrap().collect().await.unwrap()).unwrap();
        assert_eq!(json!(rows),expected);
    }
}

#[tokio::test]
async fn search_members_before_paging_with_literal_punctuation() {
    let ctx=datafusion::prelude::SessionContext::new();
    ctx.sql("CREATE VIEW t1 AS SELECT * FROM (VALUES ('A_%[DéPôt''01'),('B_%[dépôt''02'),
        ('CXX[dépôt''03'),('(Blank)'),(NULL)) d(c0)").await.unwrap().collect().await.unwrap();
    let table:Table=serde_json::from_value(json!({"id":"t1","name":"Depots","rows":5,
        "columns":[{"name":"Depot","numeric":false}]})).unwrap();
    let tables=HashMap::from([("t1".into(),table)]);
    let field=json!({"t":"t1","c":0});
    let v:Visual=serde_json::from_value(json!({"groups":[field],"metrics":[],"limit":1,"offset":1,
        "order":"category","filters":[{"field":field,"op":"contains","value":"_%[DÉPÔT'"}]})).unwrap();
    let sql=query::plan(&tables,&[],&[],&v).unwrap();
    let rows=crate::values(&ctx.sql(&sql).await.unwrap().collect().await.unwrap()).unwrap();
    assert_eq!(json!(rows),json!([["B_%[dépôt'02"]]));
    let blanks=serde_json::from_value(json!({"groups":[field],"metrics":[],"limit":10,"order":"category",
        "filters":[{"field":field,"op":"contains","value":"LaNk"}]})).unwrap();
    let sql=query::plan(&tables,&[],&[],&blanks).unwrap();
    let rows=crate::values(&ctx.sql(&sql).await.unwrap().collect().await.unwrap()).unwrap();
    assert_eq!(json!(rows),json!([["(Blank)"],[null]]));
}

#[tokio::test]
async fn calendar_bins_include_utc_month_edges_and_preserve_blanks() {
    let ctx = datafusion::prelude::SessionContext::new();
    crate::timestamp::register(&ctx);
    ctx.sql("CREATE VIEW t1 AS SELECT * FROM (VALUES ('1969-12',1),('1970-01-01',2),
        ('2024-02-29',4),('2024-04-01T00:30:00+01:00',8),
        ('2024-03-31T23:30:00-01:00',16),('2300-04',32),(NULL,64)) d(c0,c1)")
        .await.unwrap().collect().await.unwrap();
    let table:Table=serde_json::from_value(json!({"id":"t1","name":"Postings","rows":7,
        "columns":[{"name":"Date","numeric":false},{"name":"Amount","numeric":true}]})).unwrap();
    let tables=HashMap::from([("t1".into(), table)]);
    let bin=json!({"t":"t1","c":2});
    for (width, key, expected) in [(1,"2024-02-01",4),(1,"2024-03-01",8),(3,"2024-01-01",12),
        (3,"2024-04-01",16),(3,"1969-10-01",1),(12,"2024-01-01",28),(3,"2300-04-01",32),
        (2,"1969-11-01",1),(3,"2024-02-01",0),(3,"",64)] {
        let calc=serde_json::from_value(json!({"field":bin,"left":{"t":"t1","c":0},
            "op":"timeBin","calendarMonths":width})).unwrap();
        let stamp=if key.is_empty(){json!(null)}else{json!(format!("{key}T00:00:00.000Z"))};
        let view=serde_json::from_value(json!({"groups":[bin],"filters":[{"field":bin,"value":stamp}],
            "metrics":[{"field":{"t":"t1","c":1},"op":"sum"}],"limit":5})).unwrap();
        let sql=query::plan(&tables,&[],&[calc],&view).unwrap();
        let rows=crate::values(&ctx.sql(&sql).await.unwrap().collect().await.unwrap()).unwrap();
        assert_eq!(json!(rows),if expected==0 {json!([])} else {json!([[stamp,expected]])});
    }
}

#[tokio::test]
async fn time_bins_normalize_offsets_before_grouping_and_filtering() {
    let ctx = datafusion::prelude::SessionContext::new();
    crate::timestamp::register(&ctx);
    ctx.sql("CREATE VIEW t1 AS SELECT * FROM (VALUES
        ('1969-12-31T23:59:59.999Z',1),('1970-01-01T00:00:00Z',2),
        ('2026-11-01T01:45-05:00',16),('2026-11-01T01:50:00-04:00',8),
        ('2026-11-01 06:05:00',9),('2026-11-01T06:05:00Z',5),('2300-01',4),(NULL,3)) d(c0,c1)")
        .await.unwrap().collect().await.unwrap();
    let table:Table=serde_json::from_value(json!({"id":"t1","name":"Scans","rows":8,
        "columns":[{"name":"Time","numeric":false},{"name":"Parcels","numeric":true}]})).unwrap();
    let tables=HashMap::from([("t1".to_owned(),table)]);
    let bin=json!({"t":"t1","c":2});
    let calcs=[serde_json::from_value(json!({"field":bin,"left":{"t":"t1","c":0},"op":"timeBin","timeBinMs":3600000})).unwrap()];
    for (filters,expected) in [
        (json!([]),json!([["1969-12-31T23:00:00.000Z",1],["1970-01-01T00:00:00.000Z",2],
            ["2026-11-01T05:00:00.000Z",8],["2026-11-01T06:00:00.000Z",30],["2300-01-01T00:00:00.000Z",4],[null,3]])),
        (json!([{"field":bin,"value":"2026-11-01T06:00:00.000Z"}]),json!([["2026-11-01T06:00:00.000Z",30]])),
        (json!([{"field":bin,"value":"2026-11-01T06:05:00.000Z"}]),json!([])),
        (json!([{"field":bin,"op":"tuple","tuple":"rows","value":["2026-11-01T06:00:00.000Z",null]},
            {"field":{"t":"t1","c":1},"op":"tuple","tuple":"rows","value":[16,3]}]),
            json!([["2026-11-01T06:00:00.000Z",16],[null,3]])),
        (json!([{"field":bin,"value":"1969-12-31T23:00:00.000Z"}]),json!([["1969-12-31T23:00:00.000Z",1]])),
    ] {
        let visual=serde_json::from_value(json!({"groups":[bin],"filters":filters,"order":"category",
            "metrics":[{"field":{"t":"t1","c":1},"op":"sum"}],"limit":30})).unwrap();
        let sql=query::plan(&tables,&[],&calcs,&visual).unwrap();
        let rows=crate::values(&ctx.sql(&sql).await.unwrap().collect().await.unwrap()).unwrap();
        assert_eq!(json!(rows),expected);
    }
    let detail=serde_json::from_value(json!({"groups":[{"t":"t1","c":0}],"filters":[],"metrics":[],
        "sortColumn":0,"utcSortColumns":[0],"order":"asc","offset":2,"limit":3})).unwrap();
    let sql=query::plan(&tables,&[],&[],&detail).unwrap();
    let rows=crate::values(&ctx.sql(&sql).await.unwrap().collect().await.unwrap()).unwrap();
    assert_eq!(json!(rows),json!([["2026-11-01T01:50:00-04:00"],["2026-11-01 06:05:00"],
        ["2026-11-01T06:05:00Z"],["2026-11-01T01:45-05:00"]]));
    for (weekday,lower) in [(1,"1969-12-29"),(7,"1969-12-28")] {
        let calc=serde_json::from_value(json!({"field":bin,"left":{"t":"t1","c":0},
            "op":"timeBin","timeBinMs":1209600000,"weekStart":weekday})).unwrap();
        let stamp=format!("{lower}T00:00:00.000Z");
        let view=serde_json::from_value(json!({"groups":[bin],"filters":[{"field":bin,"value":stamp}],
            "metrics":[{"field":{"t":"t1","c":1},"op":"sum"}],"limit":1})).unwrap();
        let sql=query::plan(&tables,&[],&[calc],&view).unwrap();
        let rows=crate::values(&ctx.sql(&sql).await.unwrap().collect().await.unwrap()).unwrap();
        assert_eq!(json!(rows),json!([[stamp,3]]));
    }
}

#[tokio::test]
async fn numeric_bins_keep_decimal_edges_signed_values_and_blanks() {
    let ctx = datafusion::prelude::SessionContext::new();
    ctx.sql("CREATE VIEW t1 AS SELECT CAST(c0 AS DOUBLE) AS c0, 1 AS c1 FROM (VALUES
        (-1e308),(-0.30000000000000004),(-0.3),(-0.01),(0),(0.29999999999999993),(0.3),(1e308),(NULL)) data(c0)")
        .await.unwrap().collect().await.unwrap();
    let table: Table = serde_json::from_value(json!({"id":"t1","name":"Samples","rows":9,
        "columns":[{"name":"Reading","numeric":true},{"name":"Count","numeric":true}]})).unwrap();
    let tables = HashMap::from([("t1".into(),table)]);
    let bin = json!({"t":"t1","c":2});
    let calcs = [serde_json::from_value(json!({"field":bin,"left":{"t":"t1","c":0},
        "op":"bin","binSize":0.1})).unwrap()];
    let visual = serde_json::from_value(json!({"groups":[bin],"filters":[],"order":"category",
        "metrics":[{"field":{"t":"t1","c":1},"op":"count"}],"limit":20})).unwrap();
    let sql = query::plan(&tables,&[],&calcs,&visual).unwrap();
    let rows = crate::values(&ctx.sql(&sql).await.unwrap().collect().await.unwrap()).unwrap();
    assert_eq!(json!(rows),json!([[-1e308,1],[-0.4,1],[-0.3,1],[-0.1,1],[0.0,1],[0.2,1],[0.3,1],[1e308,1],[null,1]]));
}

#[tokio::test]
async fn conditional_measures_distinguish_blank_zero_and_absent_members() {
    let ctx = datafusion::prelude::SessionContext::new();
    let mut tables = HashMap::new();
    for (id, rows) in [
        ("t1", "(1,'Empty'),(2,'Zero'),(3,'Credit'),(4,'Missing')"),
        ("t2", "(1,CAST(NULL AS DOUBLE)),(2,0.0),(3,-15.0)"),
    ] {
        let table = serde_json::from_value(json!({"id":id,"name":id,"rows":4,"columns":[
            {"name":"Key","numeric":true},{"name":"Value","numeric":id=="t2"}
        ]}))
        .unwrap();
        tables.insert(id.to_owned(), table);
        ctx.sql(&format!(
            "CREATE VIEW {id} AS SELECT * FROM (VALUES {rows}) ledger(c0,c1)"
        ))
        .await
        .unwrap()
        .collect()
        .await
        .unwrap();
    }
    let links = [
        serde_json::from_value(json!({"one":{"t":"t1","c":0},"many":{"t":"t2","c":0}})).unwrap(),
    ];
    let field = json!({"t":"t2","c":1});
    let metric = |tree: serde_json::Value| json!({"op":"formula","field":field,"tree":tree});
    let constant = |n: serde_json::Value| metric(json!({"kind":"literal","number":n}));
    let sum = json!({"op":"sum","field":field});
    let blank = constant(json!(null));
    let flag = |test: serde_json::Value, yes: serde_json::Value, no: serde_json::Value| {
        metric(json!({"kind":"if","test":test,"yes":yes,"no":no}))
    };
    let checked = flag(
        json!({"kind":"isblank","value":sum}),
        blank.clone(),
        sum.clone(),
    );
    let compare = |op| {
        flag(
            json!({"kind":"compare","op":op,"left":checked,"right":constant(json!(0))}),
            constant(json!(1)),
            constant(json!(2)),
        )
    };
    let by_desk = metric(json!({"kind":"sumx","group":{"t":"t1","c":1},"value":compare("strict")}));
    for (groups, metrics, expected) in [
        (
            json!([{"t":"t1","c":1}]),
            json!([checked, compare("eq"), compare("strict")]),
            json!([
                ["Credit", -15.0, 2.0, 2.0],
                ["Empty", null, 1.0, 2.0],
                ["Missing", null, 1.0, 2.0],
                ["Zero", 0.0, 1.0, 1.0]
            ]),
        ),
        (
            json!([]),
            json!([checked, compare("strict"), blank]),
            json!([[-15.0, 2.0, null]]),
        ),
        (
            json!([]),
            json!([blank, constant(json!(0.5))]),
            json!([[null, 0.5]]),
        ),
        (json!([]), json!([by_desk]), json!([[7.0]])),
        (
            json!([{"t":"t1","c":1}]),
            json!([by_desk]),
            json!([
                ["Credit", 2.0],
                ["Empty", 2.0],
                ["Missing", 2.0],
                ["Zero", 1.0]
            ]),
        ),
        (
            json!([{"t":"t1","c":1}]),
            json!([metric(json!({"kind":"value","value":by_desk,
            "filters":[{"field":{"t":"t1","c":1},"op":"dax_eq","value":"Zero"}]}))]),
            json!([
                ["Credit", 1.0],
                ["Empty", 1.0],
                ["Missing", 1.0],
                ["Zero", 1.0]
            ]),
        ),
    ] {
        let visual = serde_json::from_value(
            json!({"groups":groups,"filters":[],"metrics":metrics,"order":"category","limit":50}),
        )
        .unwrap();
        let sql = query::plan(&tables, &links, &[], &visual).unwrap();
        let rows = crate::values(&ctx.sql(&sql).await.unwrap().collect().await.unwrap()).unwrap();
        assert_eq!(json!(rows), expected);
    }
}

#[tokio::test]
async fn hidden_formatting_measures_follow_visible_groups_and_paging() {
    let mut tables = HashMap::new();
    for id in ["t1", "t2", "t3"] {
        let t: Table = serde_json::from_value(json!({"id":id,"name":id,"rows":3,"columns":[
            {"name":"Key","numeric":true},{"name":"Value","numeric":id!="t1"}
        ]}))
        .unwrap();
        tables.insert(id.to_owned(), t);
    }
    let ctx = datafusion::prelude::SessionContext::new();
    for sql in [
        "CREATE VIEW t1 AS SELECT * FROM (VALUES (1,'A'),(2,'B'),(3,'C')) ledger(c0,c1)",
        "CREATE VIEW t2 AS SELECT c0,CAST(c1 AS DOUBLE) AS c1 FROM (VALUES (1,40),(1,60),(2,80),(99,50)) sales(c0,c1)",
        "CREATE VIEW t3 AS SELECT c0,CAST(c1 AS DOUBLE) AS c1 FROM (VALUES (1,5),(3,500),(99,0)) returns(c0,c1)",
    ] {
        ctx.sql(sql).await.unwrap().collect().await.unwrap();
    }
    let links = ["t2", "t3"].map(|id| {
        serde_json::from_value(json!({"one":{"t":"t1","c":0},"many":{"t":id,"c":0}})).unwrap()
    });
    let visible = json!({"field":{"t":"t2","c":1},"op":"sum"});
    let hidden = json!({"field":{"t":"t3","c":1},"op":"sum"});
    let group = json!({"t":"t1","c":1});
    for (groups, offset, expected) in [
        (
            json!([group]),
            0,
            json!([["A", 100.0, 5.0], ["B", 80.0, null], [null, 50.0, 0.0]]),
        ),
        (
            json!([group]),
            1,
            json!([["B", 80.0, null], [null, 50.0, 0.0]]),
        ),
        (json!([]), 0, json!([[230.0, 505.0]])),
    ] {
        let v: Visual =
            serde_json::from_value(json!({"groups":groups,"filters":[],"metrics":[visible],
            "formatMetrics":[hidden],"order":"desc","offset":offset,"limit":2}))
            .unwrap();
        let sql = query::plan(&tables, &links, &[], &v).unwrap();
        let rows = crate::values(&ctx.sql(&sql).await.unwrap().collect().await.unwrap()).unwrap();
        assert_eq!(json!(rows), expected);
    }
    let count = json!({"field":{"t":"t2","c":1},"op":"count"});
    for (order, n, expected) in [
        ("desc", 1, json!([["A", 100.0]])),
        ("desc", 2, json!([["A", 100.0], ["B", 80.0], [null, 50.0]])),
        ("asc", 1, json!([["B", 80.0], [null, 50.0]])),
    ] {
        let v: Visual =
            serde_json::from_value(json!({"groups":[group],"filters":[],"metrics":[visible],
            "rankBy":count,"order":order,"rankCutoff":n,"limit":500}))
            .unwrap();
        let sql = query::plan(&tables, &links, &[], &v).unwrap();
        let rows = crate::values(&ctx.sql(&sql).await.unwrap().collect().await.unwrap()).unwrap();
        assert_eq!(json!(rows), expected);
    }
    // C has the largest returns but no sales and is ineligible. The orphan
    // sales group has zero returns and sorts before B's missing returns.
    for (order, expected) in [
        ("desc", json!([["A", 100.0], [null, 50.0], ["B", 80.0]])),
        ("asc", json!([[null, 50.0], ["A", 100.0], ["B", 80.0]])),
    ] {
        let v: Visual =
            serde_json::from_value(json!({"groups":[group],"filters":[],"metrics":[visible],
            "rankBy":hidden,"order":order,"limit":3}))
            .unwrap();
        let sql = query::plan(&tables, &links, &[], &v).unwrap();
        let rows = crate::values(&ctx.sql(&sql).await.unwrap().collect().await.unwrap()).unwrap();
        assert_eq!(json!(rows), expected);
    }
}

#[tokio::test]
async fn cleared_dimension_filters_preserve_other_groups_and_zero_denominators() {
    let tables = [
        ("t1", vec![("key", true), ("channel", false)]),
        (
            "t2",
            vec![
                ("key", true),
                ("region", false),
                ("amount", true),
                ("day_key", true),
            ],
        ),
        ("t3", vec![("key", true), ("day", false)]),
    ]
    .into_iter()
    .map(|(id, fields)| {
        let columns = fields
            .into_iter()
            .map(|(name, numeric)| json!({ "name":name,"numeric":numeric }))
            .collect::<Vec<_>>();
        (
            id.to_owned(),
            serde_json::from_value(json!({"id":id,"name":id,"rows":5,"columns":columns})).unwrap(),
        )
    })
    .collect();
    let ctx = datafusion::prelude::SessionContext::new();
    for sql in [
        "CREATE VIEW t1 AS SELECT * FROM (VALUES (1,'Web'),(2,'Shop'),(3,'Unused')) x(c0,c1)",
        "CREATE VIEW t2 AS SELECT c0,c1,CAST(c2 AS DOUBLE) AS c2,c3 FROM (VALUES (1,'West',20,1),(2,'West',60,1),(9,'West',20,2),(1,NULL,30,1),(2,NULL,10,1),(1,'Zero',0,1)) x(c0,c1,c2,c3)",
        "CREATE VIEW t3 AS SELECT * FROM (VALUES (1,'Mon'),(2,'Tue'),(3,'Wed')) x(c0,c1)",
    ] {
        ctx.sql(sql).await.unwrap().collect().await.unwrap();
    }
    let channel = json!({"t":"t1","c":1});
    let region = json!({"t":"t2","c":1});
    let amount = json!({"t":"t2","c":2});
    let links = vec![
        serde_json::from_value(json!({"one":{"t":"t1","c":0},"many":{"t":"t2","c":0}})).unwrap(),
        serde_json::from_value(json!({"one":{"t":"t3","c":0},"many":{"t":"t2","c":3}})).unwrap(),
    ];
    let metrics = json!([
        {"field":amount,"op":"sum","removeFilters":[channel]},
        {"field":amount,"op":"ratio","denominator":amount,"denominatorRemoveFilters":[channel]}
    ]);
    let unique = json!({"op":"distinctcount","field":region});
    let count = json!({"op":"countrows","field":amount});
    let fraction =
        json!({"op":"formula","field":region,"tree":{"kind":"divide","left":unique,"right":count}});
    let difference = json!({"op":"formula","field":region,"tree":{"kind":"subtract","left":fraction,"right":fraction}});
    let v: Visual = serde_json::from_value(
        json!({"groups":[],"filters":[],"metrics":[fraction,difference],"limit":10}),
    )
    .unwrap();
    let sql = query::plan(&tables, &links, &[], &v).unwrap();
    let rows = crate::values(&ctx.sql(&sql).await.unwrap().collect().await.unwrap()).unwrap();
    assert_eq!(json!(rows), json!([[0.5, 0.0]]));
    let fixed = |metric: serde_json::Value,
                 field: &serde_json::Value,
                 op: &str,
                 value: serde_json::Value| {
        json!({"op":"formula","field":amount,"tree":{"kind":"value","value":metric,
            "filters":[{"field":field,"op":op,"value":value}]}})
    };
    let sum = json!({"op":"sum","field":amount});
    let web = fixed(sum.clone(), &channel, "dax_eq", json!("wEb"));
    let shop = fixed(sum.clone(), &channel, "dax_eq", json!("Shop"));
    let nested = fixed(web.clone(), &channel, "dax_eq", json!("Shop"));
    let orphan = fixed(sum.clone(), &channel, "dax_strict", json!(null));
    let ratio =
        json!({"op":"formula","field":amount,"tree":{"kind":"divide","left":web,"right":shop}});
    let v: Visual = serde_json::from_value(json!({"groups":[region,channel],
        "filters":[{"field":channel,"value":"Web"}],"metrics":[web,shop,nested,orphan,ratio],"limit":25})).unwrap();
    let sql = query::plan(&tables, &links, &[], &v).unwrap();
    let mut rows = crate::values(&ctx.sql(&sql).await.unwrap().collect().await.unwrap()).unwrap();
    rows.sort_by_key(|r| r[0].to_string());
    assert_eq!(
        json!(rows),
        json!([
            ["West", "Web", 20.0, 60.0, 20.0, 20.0, 1.0 / 3.0],
            ["Zero", "Web", 0.0, null, 0.0, null, null],
            [null, "Web", 30.0, 10.0, 30.0, null, 3.0]
        ])
    );
    for (groups, filters, mut expected) in [
        (
            json!([]),
            json!([{"field":channel,"value":"Web"},{"field":region,"value":"West"}]),
            vec![json!([100.0, 0.2])],
        ),
        (
            json!([region, channel]),
            json!([{"field":channel,"value":"Web"}]),
            vec![
                json!(["West", "Web", 100.0, 0.2]),
                json!([null, "Web", 40.0, 0.75]),
                json!(["Zero", "Web", 0.0, null]),
            ],
        ),
        (
            json!([channel]),
            json!([{"field":region,"value":"West"}]),
            vec![
                json!(["Shop", 100.0, 0.6]),
                json!(["Web", 100.0, 0.2]),
                json!([null, 100.0, 0.2]),
                json!(["Unused", 100.0, null]),
            ],
        ),
    ] {
        let v: Visual = serde_json::from_value(
            json!({"groups":groups,"filters":filters,"metrics":metrics,"limit":100}),
        )
        .unwrap();
        let sql = query::plan(&tables, &links, &[], &v).unwrap();
        let rows = crate::values(&ctx.sql(&sql).await.unwrap().collect().await.unwrap()).unwrap();
        let mut actual = rows.into_iter().map(|row| json!(row)).collect::<Vec<_>>();
        actual.sort_by_key(serde_json::Value::to_string);
        expected.sort_by_key(serde_json::Value::to_string);
        assert_eq!(actual, expected);
    }
    // Tuesday has only an orphan sale. Its denominator is still available to
    // named channels. A ratio alone must not invent blank rows for those channels.
    let day = json!({"t":"t3","c":1});
    let sparse = |metrics: serde_json::Value| -> Visual {
        serde_json::from_value(json!({"groups":[day,channel],"filters":[{"field":day,"value":"Tue"}],"metrics":metrics,"limit":100})).unwrap()
    };
    let v = sparse(metrics.clone());
    let sql = query::plan(&tables, &links, &[], &v).unwrap();
    let rows = crate::values(&ctx.sql(&sql).await.unwrap().collect().await.unwrap()).unwrap();
    assert_eq!(rows.len(), 4);
    assert!(
        rows.iter()
            .any(|r| json!(r) == json!(["Tue", "Unused", 20.0, null]))
    );
    let sql = query::plan(&tables, &links, &[], &sparse(json!([metrics[1]]))).unwrap();
    let rows = crate::values(&ctx.sql(&sql).await.unwrap().collect().await.unwrap()).unwrap();
    assert_eq!(json!(rows), json!([["Tue", null, 1.0]]));
}

#[tokio::test]
async fn comparison_filters_distinguish_blank_zero_and_strict_equality() {
    let table: Table = serde_json::from_value(json!({"id":"t1","name":"Ledger","rows":5,
        "columns":[{"name":"Units","numeric":true},{"name":"Desk","numeric":false}]}))
    .unwrap();
    let tables = HashMap::from([("t1".to_owned(), table)]);
    let ctx = datafusion::prelude::SessionContext::new();
    ctx.sql("CREATE VIEW t1 AS SELECT CAST(n AS DOUBLE) AS c0,s AS c1 FROM (VALUES (NULL,NULL),(0,''),(-2,'A'),(2,'a'),(3,'O''Brien')) ledger(n,s)")
        .await.unwrap().collect().await.unwrap();
    let units = json!({"t":"t1","c":0});
    let desk = json!({"t":"t1","c":1});
    let cases = [
        (&units, "dax_eq", json!(0), 2),
        (&units, "dax_strict", json!(0), 1),
        (&units, "dax_eq", json!(null), 2),
        (&units, "dax_strict", json!(null), 1),
        (&units, "dax_ne", json!(0), 3),
        (&units, "dax_gt", json!(0), 2),
        (&units, "dax_lt", json!(0), 1),
        (&units, "dax_gte", json!(0), 4),
        (&units, "dax_lte", json!(0), 3),
        (&desk, "dax_eq", json!(""), 2),
        (&desk, "dax_strict", json!(""), 1),
        (&desk, "dax_eq", json!("A"), 2),
        (&desk, "dax_eq", json!("o'brien"), 1),
    ];
    for (field, op, value, expected) in cases {
        let count = json!({"field":units,"op":"countrows"});
        let v: Visual = serde_json::from_value(json!({"groups":[],"filters":[],"limit":5,"metrics":[
            {"field":units,"op":"formula","tree":{"kind":"value","value":count,"filters":[{"field":field,"op":op,"value":value}]}}
        ]})).unwrap();
        let sql = query::plan(&tables, &[], &[], &v).unwrap();
        let rows = crate::values(&ctx.sql(&sql).await.unwrap().collect().await.unwrap()).unwrap();
        assert_eq!(json!(rows), json!([[expected]]), "{op} with {value}");
    }
}

#[tokio::test]
async fn prior_month_subtotals_shift_the_qualifying_month_and_site_together() {
    let tables = [
        ("t1", vec![("key", true), ("month", false)]),
        ("t2", vec![("key", true), ("site", false), ("units", true)]),
    ]
    .into_iter()
    .map(|(id, cols)| {
        let columns = cols
            .into_iter()
            .map(|(name, numeric)| json!({ "name":name,"numeric":numeric }))
            .collect::<Vec<_>>();
        (
            id.to_owned(),
            serde_json::from_value(json!({"id":id,"name":id,"rows":3,"columns":columns})).unwrap(),
        )
    })
    .collect();
    let ctx = datafusion::prelude::SessionContext::new();
    for sql in [
        "CREATE VIEW t1 AS SELECT * FROM (VALUES (1,'2026-01'),(2,'2026-02'),(3,'2026-03')) dates(c0,c1)",
        "CREATE VIEW t2 AS SELECT d AS c0,s AS c1,CAST(n AS DOUBLE) AS c2 FROM (VALUES (1,'A',10),(1,'B',100),(2,'A',80),(2,'B',30),(3,'A',12),(3,'B',90)) visits(d,s,n)",
    ] {
        ctx.sql(sql).await.unwrap().collect().await.unwrap();
    }
    let month = json!({"t":"t1","c":1});
    let units = json!({"field":{"t":"t2","c":2},"op":"sum"});
    let v:Visual = serde_json::from_value(json!({
        "groups":[month],"filters":[],"limit":25,
        "metrics":[{"field":{"t":"t2","c":2},"op":"sum","comparison":{"month":month,"mode":"previous"}}],
        "measureScope":{"groups":[month,{"t":"t2","c":1}],"metrics":[units],"filters":[],
                        "rules":[{"metric":units,"op":"gt","value":50.0}]}
    })).unwrap();
    let link =
        serde_json::from_value(json!({"one":{"t":"t1","c":0},"many":{"t":"t2","c":0}})).unwrap();
    let sql = query::plan(&tables, &[link], &[], &v).unwrap();
    let rows = crate::values(&ctx.sql(&sql).await.unwrap().collect().await.unwrap()).unwrap();
    assert_eq!(
        json!(rows),
        json!([["2026-01", null], ["2026-02", 10.0], ["2026-03", 30.0]])
    );
}

#[tokio::test]
async fn exact_percentiles_execute_and_interpolate() {
    let t: Table = serde_json::from_value(
        json!({"id":"t1","name":"Waits","rows":5,"columns":[{"name":"wait","numeric":true}]}),
    )
    .unwrap();
    let tables = HashMap::from([("t1".to_string(), t)]);
    let ctx = datafusion::prelude::SessionContext::new();
    ctx.sql("CREATE VIEW t1 AS SELECT CAST(x AS DOUBLE) AS c0 FROM (VALUES (1),(2),(2),(9),(NULL)) vals(x)").await.unwrap().collect().await.unwrap();
    let v:Visual=serde_json::from_value(json!({"groups":[],"metrics":[{"field":{"t":"t1","c":0},"op":"median"},{"field":{"t":"t1","c":0},"op":"p90"}],"filters":[],"limit":1})).unwrap();
    let sql = query::plan(&tables, &[], &[], &v).unwrap();
    let result = crate::values(&ctx.sql(&sql).await.unwrap().collect().await.unwrap()).unwrap();
    assert_eq!(result[0][0].as_f64(), Some(2.0));
    assert!((result[0][1].as_f64().unwrap() - 6.9).abs() < 1e-10);
}

#[tokio::test]
async fn monthly_comparison_crosses_years_and_leaves_gaps_blank() {
    let mut tables = HashMap::new();
    for (id, columns) in [
        ("t1", vec![("key", true), ("period", false)]),
        ("t2", vec![("key", true), ("value", true)]),
    ] {
        let t:Table=serde_json::from_value(json!({"id":id,"name":id,"rows":3,"columns":columns.into_iter().map(|(name,numeric)|json!({"name":name,"numeric":numeric})).collect::<Vec<_>>() })).unwrap();
        tables.insert(id.to_string(), t);
    }
    let calendar = json!({"t":"t1","c":1});
    let metric = json!({"field":{"t":"t2","c":1},"op":"sum","comparison":{"month":calendar,"mode":"change"}});
    let link =
        serde_json::from_value(json!({"one":{"t":"t1","c":0},"many":{"t":"t2","c":0}})).unwrap();
    let ctx = datafusion::prelude::SessionContext::new();
    for sql in [
        "CREATE VIEW t1 AS SELECT * FROM (VALUES (1,'2025-12'),(2,'2026-01'),(3,'2026-03')) a(c0,c1)",
        "CREATE VIEW t2 AS SELECT c0, CAST(c1 AS DOUBLE) AS c1 FROM (VALUES (1,4),(2,7),(3,9)) a(c0,c1)",
    ] {
        ctx.sql(sql).await.unwrap().collect().await.unwrap();
    }
    for (groups, filters, want) in [
        (
            json!([calendar]),
            json!([]),
            json!([["2025-12", null], ["2026-01", 3.0], ["2026-03", null]]),
        ),
        (json!([]), json!([]), json!([[null]])),
        (
            json!([]),
            json!([{"field":calendar,"value":"2026-01"}]),
            json!([[3.0]]),
        ),
    ] {
        let v: Visual = serde_json::from_value(
            json!({"groups":groups,"metrics":[metric],"filters":filters,"limit":25}),
        )
        .unwrap();
        let sql = query::plan(&tables, std::slice::from_ref(&link), &[], &v).unwrap();
        let batches = ctx.sql(&sql).await.unwrap().collect().await.unwrap();
        assert_eq!(json!(crate::values(&batches).unwrap()), want);
    }
}

#[test]
fn live_ratio_groups_filters_and_pages_at_source() {
    let table:Table=serde_json::from_value(json!({
        "id":"t1","name":"Sales","rows":0,"columns":[{"name":"Category","numeric":false},{"name":"Profit","numeric":true},{"name":"Revenue","numeric":true}],
        "source":{"schema":"sales","table":"Ledger]2025","server":"studio","database":"Reporting"}
    })).unwrap();
    let tables = HashMap::from([("t1".to_owned(), table)]);
    let v:Visual=serde_json::from_value(json!({"groups":[{"t":"t1","c":0}],"metrics":[{"field":{"t":"t1","c":1},"op":"ratio","denominator":{"t":"t1","c":2}}],"filters":[{"field":{"t":"t1","c":0},"value":"Côte d'Or"}],"limit":25,"offset":50})).unwrap();
    let sql =
        live::prefix(&tables).unwrap().unwrap() + &query::plan(&tables, &[], &[], &v).unwrap();
    let bin = json!({"t":"t1","c":3});
    let member_search=serde_json::from_value(json!({"groups":[{"t":"t1","c":0}],"metrics":[],
        "filters":[{"field":{"t":"t1","c":0},"op":"contains","value":"Côte d'Or_%"}],"limit":150})).unwrap();
    let member_sql=query::plan(&tables,&[],&[],&member_search).unwrap();
    assert!(member_sql.contains("CHARINDEX(LOWER(N'Côte d''Or_%'),LOWER(t1.c0)) > 0"),"{member_sql}");
    let calculation = serde_json::from_value(json!({"field":bin,"left":{"t":"t1","c":1},"op":"bin","binSize":0.25})).unwrap();
    let distribution = serde_json::from_value(json!({"groups":[bin],"metrics":[{"field":{"t":"t1","c":2},"op":"sum"}],
        "filters":[{"field":bin,"value":-0.25}],"limit":20})).unwrap();
    let binned = query::plan(&tables,&[],&[calculation],&distribution).unwrap();
    for fragment in ["GROUP BY (CASE", "WHERE (CASE", "ROUND(t1.c1/", "sum(t1.c2)", "= -0.25"] {
        assert!(binned.contains(fragment),"{binned}");
    }
    let time_bin=serde_json::from_value(json!({"field":bin,"left":{"t":"t1","c":0},"op":"timeBin","timeBinMs":900000})).unwrap();
    let time_visual=serde_json::from_value(json!({"groups":[bin],"metrics":[],"filters":[{"field":bin,
        "value":"2026-11-01T06:00:00.000Z"}],"limit":20})).unwrap();
    let sql_time=query::plan(&tables,&[],&[time_bin],&time_visual).unwrap();
    for fragment in ["GROUP BY (REPLACE","DATEDIFF_BIG(millisecond","SWITCHOFFSET","% 900000",">= 1793512800000","< 1793513700000"] {
        assert!(sql_time.contains(fragment),"{sql_time}");
    }
    let quarter=serde_json::from_value(json!({"field":bin,"left":{"t":"t1","c":0},"op":"timeBin","calendarMonths":3})).unwrap();
    let quarter_view=serde_json::from_value(json!({"groups":[bin],"metrics":[],"filters":[{"field":bin,
        "value":"2026-04-01T00:00:00.000Z"}],"limit":20})).unwrap();
    let quarter_sql=query::plan(&tables,&[],&[quarter],&quarter_view).unwrap();
    for fragment in ["GROUP BY (REPLACE","DATEADD(month","DATEDIFF(month","SWITCHOFFSET",
        ">= 1775001600000","< 1782864000000"] {
        assert!(quarter_sql.contains(fragment),"{quarter_sql}");
    }
    for required in [
        "[sales].[Ledger]]2025]",
        "SUM(t1.c1)/NULLIF(SUM(t1.c2),0)",
        "WHERE t1.c0 = N'Côte d''Or'",
        "GROUP BY t1.c0 ORDER BY v0",
        "OFFSET 50 ROWS FETCH NEXT 26 ROWS ONLY",
    ] {
        assert!(sql.contains(required), "{sql}");
    }
    let mut sorted = v;
    sorted.sort_column = Some(0);
    sorted.order = Some("desc".into());
    let sql = query::plan(&tables, &[], &[], &sorted).unwrap();
    assert!(sql.ends_with("ORDER BY CASE WHEN v0 IS NULL THEN 1 ELSE 0 END,v0 desc OFFSET 50 ROWS FETCH NEXT 26 ROWS ONLY"));
    sorted.then_by.push(query::ColumnOrder {
        column: 1,
        descending: false,
    });
    let sql = query::plan(&tables, &[], &[], &sorted).unwrap();
    assert!(sql.ends_with("v0 desc,CASE WHEN v1 IS NULL THEN 1 ELSE 0 END,v1 asc OFFSET 50 ROWS FETCH NEXT 26 ROWS ONLY"));
    sorted.sort_column = Some(1);
    assert!(query::plan(&tables, &[], &[], &sorted).is_err());
    sorted.sort_column = Some(2);
    assert!(query::plan(&tables, &[], &[], &sorted).is_err());

    let pairs: Visual = serde_json::from_value(json!({
        "groups":[{"t":"t1","c":0},{"t":"t1","c":1}],
        "metrics":[{"field":{"t":"t1","c":2},"op":"sum"}],
        "visibleMembers":[["Côte d'Or",5],[null,0]],
        "filters":[], "limit":20
    }))
    .unwrap();
    let sql = query::plan(&tables, &[], &[], &pairs).unwrap();
    assert!(
        sql.contains("WHERE (v0=N'Côte d''Or' AND v1=5) OR (v0 IS NULL AND v1=0) ORDER BY v0,v1")
    );
    let filtered: Visual = serde_json::from_value(json!({
        "groups":[], "metrics":[{"field":{"t":"t1","c":2},"op":"sum"}],"limit":1,
        "filters":[{"field":{"t":"t1","c":0},"op":"tuple","tuple":"points","value":["Côte d'Or",null]},
                   {"field":{"t":"t1","c":1},"op":"tuple","tuple":"points","value":[5,0]}]
    })).unwrap();
    let sql = query::plan(&tables, &[], &[], &filtered).unwrap();
    assert!(
        sql.contains("WHERE ((t1.c0=N'Côte d''Or' AND t1.c1=5) OR (t1.c0 IS NULL AND t1.c1=0))")
    );
}

#[test]
fn reject_aggregation_at_a_different_grain() {
    let tables=["t1","t2"].into_iter().map(|id|{
        let t:Table=serde_json::from_value(json!({"id":id,"name":id,"rows":2,"columns":[{"name":"key","numeric":true},{"name":"amount","numeric":true}]})).unwrap();(id.to_string(),t)
    }).collect();
    let link =
        serde_json::from_value(json!({"one":{"t":"t1","c":0},"many":{"t":"t2","c":0}})).unwrap();
    let v:Visual=serde_json::from_value(json!({"groups":[{"t":"t2","c":0}],"metrics":[{"field":{"t":"t1","c":1},"op":"sum"}],"filters":[],"limit":25})).unwrap();
    assert!(query::plan(&tables, &[link], &[], &v).is_err());
}

#[tokio::test]
async fn tuple_selections_preserve_pairs_and_project_cleared_columns() {
    let ctx = datafusion::prelude::SessionContext::new();
    let rows = "(1,'East','Online',169),(1,'East','Retail',180),(1,'West','Online',240),(1,'West','Retail',143),(2,'East','Online',99),(1,NULL,'Retail',7)";
    ctx.sql(&format!(
        "CREATE VIEW t1 AS SELECT * FROM (VALUES {rows}) ledger(c0,c1,c2,c3)"
    ))
    .await
    .unwrap()
    .collect()
    .await
    .unwrap();
    let table: Table = serde_json::from_value(json!({"id":"t1","name":"Dispatch","rows":6,"columns":[
        {"name":"Month","numeric":true},{"name":"Region","numeric":false},{"name":"Channel","numeric":false},
        {"name":"Revenue","numeric":true}
    ]})).unwrap();
    let tables = HashMap::from([("t1".into(), table)]);
    let region = json!({"t":"t1","c":1});
    let channel = json!({"t":"t1","c":2});
    let mut visual: Visual = serde_json::from_value(json!({"groups":[],"limit":20,
        "metrics":[{"op":"sum","field":{"t":"t1","c":3}},{"op":"sum","field":{"t":"t1","c":3},"removeFilters":[region]}],
        "filters":[{"field":{"t":"t1","c":0},"value":1},
        {"field":region,"op":"tuple","tuple":"selection","value":["East","West",null]},
        {"field":channel,"op":"tuple","tuple":"selection","value":["Online","Retail","Retail"]}]
    })).unwrap();
    let sql = query::plan(&tables, &[], &[], &visual).unwrap();
    let result = ctx.sql(&sql).await.unwrap().collect().await.unwrap();
    assert_eq!(json!(crate::values(&result).unwrap()), json!([[319, 739]]));
    visual.filters.extend(
        serde_json::from_value::<Vec<query::Filter>>(json!([
            {"field":region,"op":"tuple","tuple":"second","value":["East","West"]},
            {"field":channel,"op":"tuple","tuple":"second","value":["Online","Online"]}
        ]))
        .unwrap(),
    );
    let sql = query::plan(&tables, &[], &[], &visual).unwrap();
    let result = ctx.sql(&sql).await.unwrap().collect().await.unwrap();
    assert_eq!(json!(crate::values(&result).unwrap()), json!([[169, 409]]));
    visual.filters[2].value = json!(["Online"]);
    assert!(query::plan(&tables, &[], &[], &visual).is_err());
}
