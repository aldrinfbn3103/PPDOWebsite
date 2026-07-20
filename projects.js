/* =======================================================================
   projects.js — Provincial projects: the projects table, sector filter
   chips, and the admin-only "New Project" toolbar button.

   Depends on api.js (escapeHtml not required here, but this file is kept
   alongside the shared modal/nav helpers) and dashboard.js (applyAdminUI
   toggles the #btnNewProject buttons visibility).
   ======================================================================= */

/* Projects */
var projects = [
  {name:'Ubay Coastal Road Rehabilitation', sector:'Infrastructure', muni:'Ubay', budget:'₱185M', progress:68, status:'ongoing'},
  {name:'Tubigon Public Market Redevelopment', sector:'Economic', muni:'Tubigon', budget:'₱62M', progress:100, status:'completed'},
  {name:'Panglao Water Supply Expansion', sector:'Infrastructure', muni:'Panglao', budget:'₱94M', progress:41, status:'ongoing'},
  {name:'Tarlac Watershed Reforestation Phase II', sector:'Environment', muni:'Multiple LGUs', budget:'₱37M', progress:15, status:'planning'},
  {name:'Carmen-Batuan Farm-to-Market Road', sector:'Infrastructure', muni:'Carmen', budget:'₱120M', progress:52, status:'delayed'},
  {name:'Loon Health Center Upgrade', sector:'Social', muni:'Loon', budget:'₱28M', progress:100, status:'completed'}
];
function projRow(p){
  return '<tr><td>'+p.name+'</td><td>'+p.sector+'</td><td>'+p.muni+'</td><td>'+p.budget+'</td><td><div class="progress"><i style="width:'+p.progress+'%"></i></div></td><td><span class="badge '+p.status+'">'+p.status.charAt(0).toUpperCase()+p.status.slice(1)+'</span></td></tr>';
}
document.getElementById('projTable').innerHTML = projects.map(projRow).join('');

/* Project filter chips */
(function(){
  var projectFilters = document.getElementById('projectFilters');
  if(!projectFilters) return;
  projectFilters.addEventListener('click', function(e){
    var chip = e.target.closest('.chip');
    if(!chip || !projectFilters.contains(chip)) return;
    projectFilters.querySelectorAll('.chip').forEach(c=>c.classList.remove('active'));
    chip.classList.add('active');
    var status = chip.dataset.status;
    var filtered = (status === 'All') ? projects : projects.filter(p => p.status === status);
    document.getElementById('projTable').innerHTML = filtered.length
      ? filtered.map(projRow).join('')
      : '<tr><td colspan="6" style="text-align:center; color:var(--ink-soft);">No projects match this filter.</td></tr>';
  });
})();

/* Admin-only "+ Add" button (the News admin toolbar buttons are wired in news.js) */
(function(){
  var btnNewProject = document.getElementById('btnNewProject');
  if(btnNewProject) btnNewProject.addEventListener('click', function(){
    alert('Opening new project form…\n(This is a UI/UX concept — no real form is attached.)');
  });
})();