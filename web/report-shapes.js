const types=[
  ["rectangle","Rectangle"],["rounded","Rounded rectangle"],["ellipse","Ellipse"],
  ["triangle","Triangle"],["line","Line"],
];
const directions=[["horizontal","Horizontal"],["vertical","Vertical"],["down","Diagonal down"],["up","Diagonal up"]];
const color=(value,fallback)=>/^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
const number=(value,fallback,maximum)=>Number.isFinite(value) ? Math.max(0,Math.min(maximum,value)) : fallback;

function shapeStyle(v) {
  return {
    type:types.some(([id])=>id===v.shapeType) ? v.shapeType : "rectangle",
    fill:color(v.shapeFill,"#dbe8e0"),stroke:color(v.shapeOutline,"#63816c"),
    width:number(v.shapeWidth,1,16),transparency:number(v.shapeTransparency,0,100),
  };
}
function options(choices,current) {
  return choices.map(([key,label])=>'<option value="'+key+'"'+(current===key ? " selected" : "")+'>'+label+"</option>").join("");
}
export function shapeControls(v) {
  const type=shapeStyle(v).type;
  const direction=type==="line" ? '<label class="formlabel">Direction<select class="control" aria-label="Direction" data-opt="shapeDirection">'+
    options(directions,v.shapeDirection || "horizontal")+"</select></label>" : "";
  return '<label class="formlabel">Shape type<select class="control" aria-label="Shape type" data-opt="shapeType">'+options(types,type)+"</select></label>"+direction;
}
export function shapeFormat(v) {
  const style=shapeStyle(v);
  const fill=style.type==="line" ? "" :
    '<label class="formlabel">Fill color<input type="color" data-opt="shapeFill" value="'+style.fill+'"></label>'+
    '<label class="formlabel">Fill transparency (%)<input class="control" type="number" min="0" max="100" data-opt="shapeTransparency" value="'+style.transparency+'"></label>';
  return fill+'<label class="formlabel">Outline color<input type="color" data-opt="shapeOutline" value="'+style.stroke+'"></label>'+
    '<label class="formlabel">Outline width<input class="control" type="number" min="0" max="16" data-opt="shapeWidth" value="'+style.width+'"></label>';
}
function shapePath(v,style) {
  const w=v.w,h=v.h, inset=Math.min(style.width/2,w/2,h/2);
  const x=inset,y=inset,right=w-inset,bottom=h-inset,cx=w/2,cy=h/2;
  if (style.type==="line") {
    if (v.shapeDirection==="vertical") return `M${cx} ${y} V${bottom}`;
    if (v.shapeDirection==="down") return `M${x} ${y} L${right} ${bottom}`;
    if (v.shapeDirection==="up") return `M${x} ${bottom} L${right} ${y}`;
    return `M${x} ${cy} H${right}`;
  }
  if (style.type==="triangle") return `M${cx} ${y} L${right} ${bottom} H${x} Z`;
  if (style.type==="ellipse") {
    const arc=`A${cx-inset} ${cy-inset} 0 1 0`;
    return `M${x} ${cy} ${arc} ${right} ${cy} ${arc} ${x} ${cy} Z`;
  }
  if (style.type==="rounded") {
    const r=Math.min(12,cx-inset,cy-inset);
    return `M${x+r} ${y} H${right-r} Q${right} ${y} ${right} ${y+r} V${bottom-r} Q${right} ${bottom} ${right-r} ${bottom} H${x+r} Q${x} ${bottom} ${x} ${bottom-r} V${y+r} Q${x} ${y} ${x+r} ${y} Z`;
  }
  return `M${x} ${y} H${right} V${bottom} H${x} Z`;
}
export function shapeBody(v) {
  const s=shapeStyle(v);
  return `<svg data-shape="${s.type}" viewBox="0 0 ${Number(v.w)} ${Number(v.h)}" preserveAspectRatio="none" aria-hidden="true"><path d="${shapePath(v,s)}" fill="${s.type==="line" ? "none" : s.fill}" fill-opacity="${1-s.transparency/100}" stroke="${s.stroke}" stroke-width="${s.width}" stroke-linejoin="round"/></svg>`;
}
export function drawShape(context,v) {
  const s=shapeStyle(v),path=new Path2D(shapePath(v,s));
  context.save();context.translate(v.x,v.y);
  if (s.type!=="line") {
    context.fillStyle=s.fill;context.globalAlpha=1-s.transparency/100;context.fill(path);
  }
  if (s.width) {
    context.globalAlpha=1;context.strokeStyle=s.stroke;context.lineWidth=s.width;context.lineJoin="round";context.stroke(path);
  }
  context.restore();
}
