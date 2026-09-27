const fs = require('fs');
const p = '/app/dist/admin/browser/index.html';
let html = fs.readFileSync(p, 'utf8');
const boot = `<script>(function(){
function go(){
  var p=location.pathname.replace(/\\/$/,"");
  if(p==="/login"){location.replace("/login-profesional.html?from=spa");return true;}
  if(p==="/consultorio"){location.replace("/consultorio.html?from=spa");return true;}
  return false;
}
if(go())return;
var ps=history.pushState.bind(history);
history.pushState=function(){ps.apply(null,arguments);go();};
var rs=history.replaceState.bind(history);
history.replaceState=function(){rs.apply(null,arguments);go();};
window.addEventListener("popstate",go);
})();</script>`;
html = html.includes('</head>') ? html.replace('</head>', boot + '</head>') : boot + html;
fs.writeFileSync(p, html);
console.log('spa bridge injected');
