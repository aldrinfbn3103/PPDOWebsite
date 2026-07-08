// url for the news and announcements
const API_URL = "https://script.google.com/macros/s/AKfycbxDgCxlMthEiYR9WoFif_4p-jqFdfJsL6srJ3rbkEfSmdVZgTXMGkEaLsRSPOYymv1y/exec";


/* ---------------- Event delegation (replaces inline onclick handlers) ---------------- */
document.addEventListener('click', function(e){
  var closeTarget = e.target.closest('[data-action="close-sidebar"]');
  if(closeTarget){ closeSidebar(); return; }

  var openTarget = e.target.closest('[data-action="open-sidebar"]');
  if(openTarget){ openSidebar(); return; }

  var goTarget = e.target.closest('[data-go]');
  if(goTarget){ go(goTarget.dataset.go, goTarget.hasAttribute('data-target') ? goTarget : null); return; }

  var connectTrigger = e.target.closest('[data-action="trigger-div-connect"]');
  if(connectTrigger){
    var slug = connectTrigger.dataset.slug;
    var btn = slug ? document.getElementById('btnDivConnect-' + slug) : null;
    if(btn) btn.click();
    return;
  }

  // NEW: expand/collapse the sidebar "Divisions" dropdown. This only
  // toggles visibility of the submenu — it intentionally has no data-go,
  // so clicking it never navigates anywhere on its own.
  var divisionsToggle = e.target.closest('[data-action="toggle-divisions"]');
  if(divisionsToggle){ toggleDivisionsMenu(divisionsToggle); return; }
});

// NEW: allow keyboard users (Enter/Space) to open/close the Divisions
// dropdown, since the toggle is an <a> acting as a button (role="button").
document.getElementById('navDivisionsToggle').addEventListener('keydown', function(e){
  if(e.key === 'Enter' || e.key === ' '){
    e.preventDefault();
    toggleDivisionsMenu(this);
  }
});

// NEW: toggles the open/closed state of the sidebar Divisions dropdown
// and keeps its aria-expanded attribute in sync for accessibility.
function toggleDivisionsMenu(toggleEl){
  var dropdown = document.getElementById('navDivisions');
  var isOpen = dropdown.classList.toggle('open');
  toggleEl.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
}

/* ---------------- Navigation ---------------- */
function go(target, el){
  document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'));
  document.getElementById('sec-'+target).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  var trigger = el || document.querySelector('[data-target="'+target+'"]');
  if(trigger) trigger.classList.add('active');
  closeSidebar();
  window.scrollTo(0,0);
}
function openSidebar(){document.getElementById('sidebar').classList.add('open'); document.getElementById('overlay').classList.add('open');}
function closeSidebar(){document.getElementById('sidebar').classList.remove('open'); document.getElementById('overlay').classList.remove('open');}

/* ---------------- Site-wide auth (real Firebase auth, single sign-in) ----------------
   One shared sign-in, available from the topbar on every page — no more
   per-division login boxes and no more client-side role toggle. Signing in
   as a division's account (e.g. research@ppdo.gov.ph) unlocks editing for
   that division's own page only; everyone else (including other divisions)
   stays read-only there. Administrative Services, plus the staff/admin-only
   action buttons on News, Documents, and Projects, are restricted to the
   admin@ppdo.gov.ph account specifically.

   This is the one auth controller for the whole site: it owns the Firebase
   auth listener, the topbar sign-in widget, and the admin-only UI gating.
   The Division Dashboards module (further down) reads `signedInSlug` from
   here and just re-fetches/re-renders its widgets when it changes. */
var DIVISION_ACCOUNTS = {
  'admin@ppdo.gov.ph': 'admin',
  'pdip@ppdo.gov.ph': 'pdip',
  'research@ppdo.gov.ph': 'research',
  'monitoring@ppdo.gov.ph': 'monitoring',
  'planning@ppdo.gov.ph': 'planning'
};
var DIVISION_NAMES = {
  admin: 'Admin, Finance and Support',
  pdip: 'Project Development and Investment Programming',
  research: 'Research, GIS and Data Management',
  monitoring: 'Monitoring and Evaluation, Reporting',
  planning: 'Development Planning'
};

var fbAuth = (typeof firebase !== 'undefined') ? firebase.auth() : null;
var adminSignedIn = false;
var signedInSlug = null; // slug of the division tied to the logged-in account, if any
var authStateListeners = []; // other modules (e.g. Division Dashboards) register here

function onAuthStateReady(fn){ authStateListeners.push(fn); }

(function(){
  function renderAuthWidget(user, mySlug){
    var widget = document.getElementById('authWidget');
    if(!widget) return;

    if(user){
      var label = mySlug ? DIVISION_NAMES[mySlug] : user.email;
      widget.innerHTML = '<div style="display:flex; align-items:center; gap:8px;">'
        + '<div class="avatar" title="Signed in as '+escapeHtml(user.email)+'">'+escapeHtml((mySlug||'US').slice(0,2).toUpperCase())+'</div>'
        + '<div style="display:flex; flex-direction:column; line-height:1.2;">'
        + '<span style="font-size:12.5px; font-weight:600;">'+escapeHtml(label)+'</span>'
        + '<a href="#" id="btnSiteSignOut" style="font-size:11.5px; color:var(--ink-soft);">Sign out</a>'
        + '</div></div>';
      var signOutBtn = document.getElementById('btnSiteSignOut');
      if(signOutBtn) signOutBtn.addEventListener('click', function(e){ e.preventDefault(); fbAuth && fbAuth.signOut(); });
    } else {
      widget.innerHTML = '<button class="btn btn-outline" id="btnSiteSignIn" style="padding:6px 14px; font-size:13px;">Sign in</button>';
      var signInBtn = document.getElementById('btnSiteSignIn');
      if(signInBtn) signInBtn.addEventListener('click', openSignInModal);
    }
  }

  function openSignInModal(){
    var bodyHtml =
      '<div class="form-group"><label>Division email</label><input type="email" id="fSiteEmail" placeholder="e.g. research@ppdo.gov.ph"></div>'
      + '<div class="form-group"><label>Password</label><input type="password" id="fSitePass" placeholder="Password"></div>'
      + '<div class="form-error" id="fSiteAuthError">Wrong email or password.</div>';

    openModal('Sign in', bodyHtml, function(){
      var email = document.getElementById('fSiteEmail').value.trim();
      var pass = document.getElementById('fSitePass').value;
      var errEl = document.getElementById('fSiteAuthError');
      errEl.classList.remove('show');
      if(!fbAuth) return false;
      return fbAuth.signInWithEmailAndPassword(email, pass).then(function(){
        return true;
      }).catch(function(){
        errEl.classList.add('show');
        return false;
      });
    }, {saveLabel: 'Sign in'});
  }

  function applyAdminUI(isAdmin){
    adminSignedIn = isAdmin;

    var adminGate = document.getElementById('adminGate');
    var adminBody = document.getElementById('adminBody');
    var badge = document.getElementById('adminBadge');

    ['btnNewPost','btnEdit','btnDelete','btnUploadDoc','btnNewProject'].forEach(function(id){
      var el = document.getElementById(id);
      if(el) el.style.display = isAdmin ? 'inline-flex' : 'none';
    });

    if(adminGate){
      adminGate.innerHTML = isAdmin ? '' : '<div class="access-note"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l8 3v6c0 5-3.5 8.5-8 11-4.5-2.5-8-6-8-11V5z"/></svg><div><strong>Admin sign-in required.</strong><br>Administrative Services (personnel records, approvals, and internal workflows) are restricted to the Admin, Finance and Support division account. Sign in from the topbar to continue.</div></div>';
    }
    if(adminBody) adminBody.style.display = isAdmin ? 'block' : 'none';
    if(badge) badge.textContent = isAdmin ? 'Admin' : 'Admin only';

    if(typeof renderNews === 'function') renderNews();
    if(typeof renderDocs === 'function') renderDocs();
  }

  function handleAuthState(user){
    var mySlug = user ? (DIVISION_ACCOUNTS[(user.email || '').toLowerCase()] || null) : null;
    signedInSlug = mySlug;
    applyAdminUI(mySlug === 'admin');
    renderAuthWidget(user, mySlug);
    authStateListeners.forEach(function(fn){ fn(user, mySlug); });
  }

  if(fbAuth){
    fbAuth.onAuthStateChanged(handleAuthState);
  } else {
    handleAuthState(null);
  }
})();

function escapeHtml(str){
  return (str || '').toString().replace(/[&<>"']/g, function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}

/* ---------------- Sample data ---------------- */
let newsData = [];
var newsSeq = 7;

// news card modified
function newsCard(n){

    const thumbStyle = n.image
        ? `style="background-image:url('${n.image}')"`
        : "";

    return `
        <div class="card news-card" data-news-id="${n.id}" onclick="openNewsDetail('${n.id}')">

            <div class="news-thumb ${n.image ? 'has-image' : ''}" ${thumbStyle}>
                <span>${n.category}</span>
            </div>

            <div class="news-date">
                ${new Date(n.date).toLocaleDateString('en-US',{
                    year:'numeric',
                    month:'long',
                    day:'numeric'
                })}
            </div>

            <h4>${n.title}</h4>

            <p>${n.summary}</p>

        </div>
    `;

}
// render news function modified
function renderNews(){

    const activeChip = document.querySelector("#newsFilters .chip.active");

    const category = activeChip
        ? activeChip.dataset.tag
        : "All";

    let filtered = newsData;

    if(category !== "All"){

        filtered = newsData.filter(item =>
            item.category === category
        );

    }

    document.getElementById("newsGrid").innerHTML =
        filtered.map(newsCard).join("");

    document.getElementById("dashNews").innerHTML =
        newsData
        .slice(0,3)
        .map(newsCard)
        .join("");

}

async function loadNews() {

    try {

        const response = await fetch(API_URL);
        const data = await response.json();

        console.log("API Data:", data);

        newsData = data;

        console.log("newsData:", newsData);

        renderNews();

    } catch(error) {

        console.error("Unable to load news:", error);

    }

}

loadNews();


/* Citizen's Charter */
var charterExternal = [
  {name:'Preparation, Copying &amp; Printing of Maps (GIS-based)', time:'3 working days', fee:'₱50–₱250 depending on size'},
  {name:'Provision of Socio-Economic Profile &amp; Poverty Indicators', time:'2 working days', fee:'No charge'},
  {name:'Issuance of Certified True Copy of PDC Resolutions', time:'1 working day', fee:'₱2.00 per page'},
  {name:'Request for Shapefiles / Spatial Data (with MOA)', time:'5 working days', fee:'No charge'}
];
var charterInternal = [
  {name:'Provision of Socio-Economic Profile for Planning Use', time:'2 working days', fee:'Internal — no charge'},
  {name:'Endorsement of Project Proposals to PDC', time:'7 working days', fee:'Internal — no charge'},
  {name:'Technical Review of Municipal Development Plans', time:'10 working days', fee:'Internal — no charge'}
];
function charterCard(c){
  return '<div class="card"><h3>'+c.name+'</h3><p style="font-size:12.5px;color:var(--ink-soft);margin:8px 0 0">⏱ Processing time: <strong>'+c.time+'</strong></p><p style="font-size:12.5px;color:var(--ink-soft);margin:4px 0 0">💰 Fee: <strong>'+c.fee+'</strong></p></div>';
}
function renderCharter(kind){
  var data = kind==='internal'? charterInternal : charterExternal;
  document.getElementById('charterList').innerHTML = data.map(charterCard).join('');
}
renderCharter('external');
document.querySelectorAll('[data-ctab]').forEach(function(t){
  t.addEventListener('click', function(){
    document.querySelectorAll('[data-ctab]').forEach(x=>x.classList.remove('active'));
    t.classList.add('active');
    renderCharter(t.dataset.ctab);
  });
});

/* Municipalities */
var districts = {
  '1st District': ['Tagbilaran City','Alburquerque','Antequera','Baclayon','Balilihan','Calape','Catigbian','Corella','Cortes','Dauis','Loon','Maribojoc','Panglao','Sikatuna','Tubigon'],
  '2nd District': ['Bien Unido','Buenavista','Clarin','Dagohoy','Danao','Getafe','Inabanga','Pres. Carlos P. Garcia','Sagbayan','San Isidro','San Miguel','Talibon','Trinidad','Ubay'],
  '3rd District': ['Alicia','Anda','Batuan','Bilar','Candijay','Carmen','Dimiao','Duero','Garcia Hernandez','Guindulman','Jagna','Lila','Loay','Loboc','Mabini','Pilar','Sevilla','Sierra Bullones','Valencia']
};
var html='';
for(var d in districts){
  html += '<div class="district-block"><h4>'+d+'</h4><div class="muni-chip-grid">';
  districts[d].forEach(function(m){ html += '<a class="muni-chip" href="#">'+m+'</a>'; });
  html += '</div></div>';
}
document.getElementById('muniLists').innerHTML = html;

/* Documents */
var docs = [
  {id:'d1', name:'Administrative Reports Q2 2026', cat:'Administrative Reports', year:'2026', size:'2.1 MB', access:'Internal'},
  {id:'d2', name:'PDC Resolutions, Series of 2026', cat:'PDC Resolutions', year:'2026', size:'890 KB', access:'Public'},
  {id:'d3', name:'Tarlac Economic Factbook 2024', cat:'Socio-Economic Data', year:'2024', size:'14.3 MB', access:'Public'},
  {id:'d4', name:'Base Map Shapefiles — Tarlac Province', cat:'Shapefiles', year:'2025', size:'48 MB', access:'Restricted'},
  {id:'d5', name:'Income Classification by Municipality', cat:'Socio-Economic Data', year:'2023', size:'420 KB', access:'Public'},
  {id:'d6', name:'CSO Accreditation List 2022–2025', cat:'Administrative Reports', year:'2025', size:'1.0 MB', access:'Public'},
  {id:'d7', name:'Road Condition Map Dataset', cat:'Shapefiles', year:'2024', size:'22 MB', access:'Restricted'}
];
function accessBadgeHtml(access){
  return access==='Public' ? '<span class="badge completed">Public</span>' : access==='Internal' ? '<span class="badge planning">Internal</span>' : '<span class="badge delayed">Restricted</span>';
}
function docRow(d){
  return '<tr><td><div class="doc-row" data-doc-open="'+d.id+'" style="cursor:pointer"><div class="doc-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg></div>'+d.name+'</div></td><td>'+d.cat+'</td><td>'+d.year+'</td><td>'+d.size+'</td><td>'+accessBadgeHtml(d.access)+'</td><td><div class="doc-actions"><a class="btn btn-outline" style="padding:6px 12px" data-doc-preview="'+d.id+'">Preview</a><a class="btn btn-outline" style="padding:6px 12px" data-doc="'+d.name+'">Download</a></div></td></tr>';
}
function renderDocsTable(list){
  document.getElementById('docTable').innerHTML = list.length
    ? list.map(docRow).join('')
    : '<tr><td colspan="6" style="text-align:center; color:var(--ink-soft);">No documents match your search.</td></tr>';
}
function renderDocs(){ renderDocsTable(docs); }
renderDocsTable(docs);

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

/* Sectors */
var sectors = [
  {name:'Social Development Sector', desc:'Health, education, housing, and social welfare planning.'},
  {name:'Economic Development Sector', desc:'Trade, agriculture, tourism, and livelihood programs.'},
  {name:'Infrastructure Development Sector', desc:'Roads, water, power, and communication systems.'},
  {name:'Environment Management Sector', desc:'Watershed, coastal, and natural resource protection.'},
  {name:'Development Administration Sector', desc:'Public finance, local governance, justice &amp; safety.'},
  {name:'Administrative Division', desc:'Personnel, records, and internal support services.'}
];
document.getElementById('sectorGrid').innerHTML = sectors.map(function(s){
  return '<div class="card module-card"><div class="module-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/></svg></div><h4>'+s.name+'</h4><p>'+s.desc+'</p></div>';
}).join('');

/* Map hex grid */
var hex='';
for(var i=0;i<54;i++){ hex += '<div></div>'; }
document.getElementById('mapHex').innerHTML = hex;

/* ---------------- Charts ---------------- */
Chart.defaults.font.family = "'Inter',sans-serif";
Chart.defaults.color = '#4B5A53';

new Chart(document.getElementById('chartSectors'), {
  type:'bar',
  data:{
    labels:['Infra','Social','Economic','Environment','Dev. Admin'],
    datasets:[{label:'Completed', data:[38,44,30,20,26], backgroundColor:'#145C34', borderRadius:6},
              {label:'Ongoing', data:[52,30,26,18,14], backgroundColor:'#C8971E', borderRadius:6}]
  },
  options:{responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom', labels:{boxWidth:10}}}, scales:{y:{beginAtZero:true, grid:{color:'#EEF3F0'}}, x:{grid:{display:false}}}}
});

new Chart(document.getElementById('chartStatus'), {
  type:'doughnut',
  data:{labels:['Ongoing','Completed','Planning','Delayed'], datasets:[{data:[64,52,6,6], backgroundColor:['#1C7A44','#0E4A2B','#C8971E','#B3352A']}]},
  options:{responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom', labels:{boxWidth:10}}}, cutout:'62%'}
});

new Chart(document.getElementById('chartPop'), {
  type:'line',
  data:{labels:['2016','2018','2020','2022','2024','2026'],
    datasets:[{label:'Tarlac population (millions)', data:[1.39,1.39,1.39,1.42,1.44,1.46], borderColor:'#145C34', backgroundColor:'rgba(20,92,52,.1)', fill:true, tension:.35}]},
  options:{responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{y:{grid:{color:'#EEF3F0'}}, x:{grid:{display:false}}}}
});

new Chart(document.getElementById('chartIRA'), {
  type:'pie',
  data:{labels:['1st District','2nd District','3rd District'], datasets:[{data:[38,34,28], backgroundColor:['#0E4A2B','#1C7A44','#C8971E']}]},
  options:{responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom', labels:{boxWidth:10}}}}
});

/* =======================================================================
   Functionality wiring for existing controls.
   ======================================================================= */
function normalize(str){
  return (str || '').toString().toLowerCase().trim();
}

/* News filter chips */
(function(){
  var newsFilters = document.getElementById('newsFilters');
  if(!newsFilters) return;
  newsFilters.addEventListener('click', function(e){
    var chip = e.target.closest('.chip');
    if(!chip || !newsFilters.contains(chip)) return;
    newsFilters.querySelectorAll('.chip').forEach(c=>c.classList.remove('active'));
    chip.classList.add('active');
    renderNews();
  });
})();

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

/* Document Library: search + category + year filter */
function filterDocs(){
  var q = normalize(document.getElementById('docSearchInput').value);
  var cat = document.getElementById('docCategoryFilter').value;
  var year = document.getElementById('docYearFilter').value;
  var filtered = docs.filter(function(d){
    var matchesQuery = !q || normalize(d.name).indexOf(q) !== -1 || normalize(d.cat).indexOf(q) !== -1;
    var matchesCat = !cat || d.cat === cat;
    var matchesYear = !year || d.year === year;
    return matchesQuery && matchesCat && matchesYear;
  });
  renderDocsTable(filtered);
}
(function(){
  var searchInput = document.getElementById('docSearchInput');
  var catSelect = document.getElementById('docCategoryFilter');
  var yearSelect = document.getElementById('docYearFilter');
  var filterBtn = document.getElementById('btnDocFilter');
  if(searchInput) searchInput.addEventListener('input', filterDocs);
  if(catSelect) catSelect.addEventListener('change', filterDocs);
  if(yearSelect) yearSelect.addEventListener('change', filterDocs);
  if(filterBtn) filterBtn.addEventListener('click', filterDocs);
})();

/* Document Library: download buttons + preview */
(function(){
  var docTable = document.getElementById('docTable');
  if(!docTable) return;
  docTable.addEventListener('click', function(e){
    var downloadLink = e.target.closest('a[data-doc]');
    if(downloadLink){
      e.preventDefault();
      alert('Downloading "' + downloadLink.dataset.doc + '"…\n(This is a UI/UX concept — no real file is attached.)');
      return;
    }
    var previewLink = e.target.closest('[data-doc-preview]');
    if(previewLink){
      e.preventDefault();
      openDocPreview(previewLink.dataset.docPreview);
      return;
    }
    var openRow = e.target.closest('[data-doc-open]');
    if(openRow){
      openDocPreview(openRow.dataset.docOpen);
    }
  });
})();

function openDocPreview(docId){
  var d = docs.find(function(x){ return x.id === docId; });
  if(!d) return;
  var adminActions = adminSignedIn
    ? '<div class="doc-preview-admin-actions">'
      + '<a class="btn btn-outline" data-doc="'+d.name+'">Download</a>'
      + '</div>'
    : '';
  var bodyHtml =
    '<div class="doc-preview-box">'
    + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h6M9 9h1"/></svg>'
    + '<p>No file preview is attached to this concept. In production this panel would render the first page of the PDF or a thumbnail of the dataset.</p>'
    + '</div>'
    + '<div class="doc-preview-meta">'
    + '<div><strong>'+d.cat+'</strong>Category</div>'
    + '<div><strong>'+d.year+'</strong>Year</div>'
    + '<div><strong>'+d.size+'</strong>File size</div>'
    + '<div><strong>'+accessBadgeHtml(d.access)+'</strong>Access</div>'
    + '</div>'
    + adminActions;

  openModal(d.name, bodyHtml, null, {wide:true, hideFoot:true});

  var dlBtn = modalBody.querySelector('a[data-doc]');
  if(dlBtn) dlBtn.addEventListener('click', function(e){
    e.preventDefault();
    alert('Downloading "' + dlBtn.dataset.doc + '"…\n(This is a UI/UX concept — no real file is attached.)');
  });
}

/* Municipality search */
(function(){
  var muniSearch = document.getElementById('muniSearchInput');
  if(!muniSearch) return;
  muniSearch.addEventListener('input', function(){
    var q = normalize(muniSearch.value);
    document.querySelectorAll('#muniLists .muni-chip').forEach(function(chip){
      chip.style.display = normalize(chip.textContent).indexOf(q) !== -1 ? '' : 'none';
    });
    document.querySelectorAll('#muniLists .district-block').forEach(function(block){
      var anyVisible = Array.from(block.querySelectorAll('.muni-chip')).some(c => c.style.display !== 'none');
      block.style.display = anyVisible ? '' : 'none';
    });
  });
})();

(function(){
  var muniLists = document.getElementById('muniLists');
  if(!muniLists) return;
  muniLists.addEventListener('click', function(e){
    var chip = e.target.closest('.muni-chip');
    if(!chip) return;
    e.preventDefault();
    alert('Opening municipal profile for ' + chip.textContent.trim() + '…');
  });
})();

/* GIS map tools: zoom in / zoom out / fullscreen */
(function(){
  var zoomLevel = 1;
  var mapHex = document.getElementById('mapHex');
  var mapCanvas = document.getElementById('mapCanvas');
  var zoomInBtn = document.getElementById('btnMapZoomIn');
  var zoomOutBtn = document.getElementById('btnMapZoomOut');
  var fullscreenBtn = document.getElementById('btnMapFullscreen');

  function applyZoom(){
    if(mapHex) mapHex.style.transform = 'rotate(-4deg) scale(' + zoomLevel + ')';
  }
  if(zoomInBtn) zoomInBtn.addEventListener('click', function(){
    zoomLevel = Math.min(zoomLevel + 0.15, 2);
    applyZoom();
  });
  if(zoomOutBtn) zoomOutBtn.addEventListener('click', function(){
    zoomLevel = Math.max(zoomLevel - 0.15, 0.5);
    applyZoom();
  });
  if(fullscreenBtn) fullscreenBtn.addEventListener('click', function(){
    if(!mapCanvas) return;
    if(!document.fullscreenElement){
      if(mapCanvas.requestFullscreen){ mapCanvas.requestFullscreen(); }
      else { alert('Fullscreen is not supported in this browser.'); }
    } else {
      document.exitFullscreen();
    }
  });
})();

/* Citizen's Charter: Download PDF button */
(function(){
  var btn = document.getElementById('btnDownloadCharter');
  if(btn) btn.addEventListener('click', function(){
    alert('Preparing Citizen\'s Charter PDF for download…\n(This is a UI/UX concept — no real file is attached.)');
  });
})();

/* GIS: Request Shapefile button */
(function(){
  var btn = document.getElementById('btnRequestShapefile');
  if(btn) btn.addEventListener('click', function(){
    alert('Opening shapefile request form…\n(This is a UI/UX concept — no real form is attached.)');
  });
})();

/* Reports: Export CSV button */
(function(){
  var btn = document.getElementById('btnExportCSV');
  if(btn) btn.addEventListener('click', function(){
    alert('Exporting report data as CSV…\n(This is a UI/UX concept — no real file is attached.)');
  });
})();

/* Admin-only "+ Upload / + Add" buttons (news buttons wired separately below) */
(function(){
  var btnUploadDoc = document.getElementById('btnUploadDoc');
  var btnNewProject = document.getElementById('btnNewProject');
  if(btnUploadDoc) btnUploadDoc.addEventListener('click', function(){
    alert('Opening document upload dialog…\n(This is a UI/UX concept — no real upload is attached.)');
  });
  if(btnNewProject) btnNewProject.addEventListener('click', function(){
    alert('Opening new project form…\n(This is a UI/UX concept — no real form is attached.)');
  });
})();

/* Topbar global search */
var topbarSearchInput = document.querySelector('.search-wrap input[type="text"]');
if(topbarSearchInput){
  topbarSearchInput.id = 'topbarSearchInput';
  topbarSearchInput.addEventListener('keydown', function(e){
    if(e.key !== 'Enter') return;
    var q = normalize(topbarSearchInput.value);
    if(!q) return;

    var hitInDocs = docs.some(d => normalize(d.name).indexOf(q) !== -1 || normalize(d.cat).indexOf(q) !== -1);
    var hitInProjects = projects.some(p => normalize(p.name).indexOf(q) !== -1 || normalize(p.sector).indexOf(q) !== -1 || normalize(p.muni).indexOf(q) !== -1);
    var hitInNews = newsData.some(n => normalize(n.title).indexOf(q) !== -1 || normalize(n.body).indexOf(q) !== -1);

    if(hitInDocs){
      go('documents', document.querySelector('[data-target="documents"]'));
      document.getElementById('docSearchInput').value = topbarSearchInput.value;
      filterDocs();
    } else if(hitInProjects){
      go('projects', document.querySelector('[data-target="projects"]'));
    } else if(hitInNews){
      go('news', document.querySelector('[data-target="news"]'));
    } else {
      alert('No results found for "' + topbarSearchInput.value + '".');
    }
  });
}

/* =======================================================================
   Generic modal helper (calendar / employee / visitor / news forms)
   ======================================================================= */
var modalOverlay = document.getElementById('modalOverlay');
var modalBox = document.getElementById('modalBox');
var modalTitle = document.getElementById('modalTitle');
var modalBody = document.getElementById('modalBody');
var modalFoot = document.getElementById('modalFoot');
var modalSaveBtn = document.getElementById('modalSaveBtn');
var modalCancelBtn = document.getElementById('modalCancelBtn');
var modalCloseBtn = document.getElementById('modalCloseBtn');
var modalOnSave = null;

function openModal(title, bodyHtml, onSave, opts){
  opts = opts || {};
  modalTitle.textContent = title;
  modalBody.innerHTML = bodyHtml;
  modalOnSave = onSave;
  modalBox.classList.toggle('modal-wide', !!opts.wide);
  modalFoot.style.display = opts.hideFoot ? 'none' : 'flex';
  modalSaveBtn.textContent = opts.saveLabel || 'Save';
  modalSaveBtn.className = opts.saveClass || 'btn btn-primary';
  modalOverlay.classList.add('open');
  var firstField = modalBody.querySelector('input,select,textarea');
  if(firstField) setTimeout(function(){ firstField.focus(); }, 30);
}
function closeModal(){
  modalOverlay.classList.remove('open');
  modalOnSave = null;
  modalBody.innerHTML = '';
  modalBox.classList.remove('modal-wide');
  modalFoot.style.display = 'flex';
  modalSaveBtn.textContent = 'Save';
  modalSaveBtn.className = 'btn btn-primary';
}
modalCancelBtn.addEventListener('click', closeModal);
modalCloseBtn.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', function(e){ if(e.target === modalOverlay) closeModal(); });
document.addEventListener('keydown', function(e){ if(e.key === 'Escape' && modalOverlay.classList.contains('open')) closeModal(); });
modalSaveBtn.addEventListener('click', async function(){
  if(typeof modalOnSave === 'function'){
    modalSaveBtn.disabled = true;
    var result;
    try{
      result = await modalOnSave();
    } finally {
      modalSaveBtn.disabled = false;
    }
    if(result === false) return; // validation failed or save failed, keep modal open
  }
  closeModal();
});

function pad2(n){ return n < 10 ? '0'+n : ''+n; }
function dateKey(y,m,d){ return y+'-'+pad2(m+1)+'-'+pad2(d); }

// Wires a contenteditable element for click-to-fix-typo editing.
function wireInlineEdit(el, opts){
  opts = opts || {};
  var lastGood = el.textContent.trim();
  el.addEventListener('keydown', function(e){
    if(e.key === 'Enter'){ e.preventDefault(); el.blur(); }
    if(e.key === 'Escape'){ el.textContent = lastGood; el.blur(); }
  });
  el.addEventListener('blur', function(){
    var val = el.textContent.trim();
    if(!val){
      el.textContent = lastGood;
      return;
    }
    if(val === lastGood) return;
    lastGood = val;
    el.textContent = val;
    if(typeof opts.onSave === 'function') opts.onSave(val);
  });
}

/* =======================================================================
   News & Announcements: view, create, update, delete, image upload
   ======================================================================= */
function friendlyToday(){
  return new Date().toLocaleDateString(undefined, {month:'short', day:'numeric', year:'numeric'});
}

function newsImageUploadHtml(currentImages){
  var imgs = currentImages || [];
  var previewItems = imgs.map(function(src, idx){
    return '<div class="image-preview-item" data-img-idx="'+idx+'"><img src="'+src+'" alt=""><button type="button" class="image-remove-btn" data-img-remove="'+idx+'">✕</button></div>';
  }).join('');
  return ''
    + '<div class="form-group"><label>Photos / attachments (optional)</label>'
    + '<div class="image-drop"><input type="file" id="fNewsImage" accept="image/*" multiple><span class="image-drop-label">📷 Click or drag images here to attach (multiple allowed)</span></div>'
    + '<div class="image-preview-grid" id="newsImagePreviewGrid">'+previewItems+'</div>'
    + '<div class="form-hint">JPG or PNG. The first photo appears on the announcement card; all photos appear in the detail gallery.</div>'
    + '</div>';
}

function wireNewsImageUpload(initialImages){
  var currentImages = (initialImages || []).slice();
  var fileInput = document.getElementById('fNewsImage');
  var previewGrid = document.getElementById('newsImagePreviewGrid');

  function renderPreviewGrid(){
    previewGrid.innerHTML = currentImages.map(function(src, idx){
      return '<div class="image-preview-item" data-img-idx="'+idx+'"><img src="'+src+'" alt=""><button type="button" class="image-remove-btn" data-img-remove="'+idx+'">✕</button></div>';
    }).join('');
    previewGrid.querySelectorAll('[data-img-remove]').forEach(function(btn){
      btn.addEventListener('click', function(){
        currentImages.splice(Number(btn.dataset.imgRemove), 1);
        renderPreviewGrid();
      });
    });
  }
  renderPreviewGrid();

  if(fileInput){
    fileInput.addEventListener('change', function(){
      var files = Array.from(fileInput.files || []);
      if(!files.length) return;
      var remaining = files.length;
      files.forEach(function(file){
        if(!file.type.match('image.*')){
          remaining--;
          return;
        }
        var reader = new FileReader();
        reader.onload = function(e){
          currentImages.push(e.target.result);
          renderPreviewGrid();
        };
        reader.readAsDataURL(file);
      });
      fileInput.value = '';
    });
  }
  return function getImagesData(){ return currentImages; };
}
// ACTION FOR ADD NEWS
async function saveNewsToDatabase(news) {

    const formData = new FormData();

    formData.append("action", "addNews");

    Object.keys(news).forEach(key => {
        formData.append(key, news[key]);
    });

    const response = await fetch(API_URL, {
        method: "POST",
        body: formData
    });

    return await response.json();
}

// ACTION FOR UPDATE NEWS
async function updateNewsInDatabase(news) {

    const formData = new FormData();

    formData.append("action", "updateNews");

    Object.keys(news).forEach(key => {
        formData.append(key, news[key]);
    });

    const response = await fetch(API_URL, {
        method: "POST",
        body: formData
    });

    return await response.json();

}

// ACTION FOR DELETE NEWS
async function deleteNewsFromDatabase(id) {

    const formData = new FormData();

    formData.append("action", "deleteNews");
    formData.append("id", id);

    const response = await fetch(API_URL, {
        method: "POST",
        body: formData
    });

    return await response.json();

}

/* Add / Edit announcement form (shared) */
function openNewsForm(existingId){
  var existing = existingId ? newsData.find(function(n){ return String(n.id) === String(existingId); }) : null;
  var tagOptions = ['Advisory','Project Update','Public Notice','Event'].map(function(t){
    return '<option value="'+t+'"'+(existing && existing.category===t ? ' selected':'')+'>'+t+'</option>';
  }).join('');

  var bodyHtml =
    '<div class="form-group"><label>Title</label><input type="text" id="fNewsTitle" placeholder="e.g. New hazard maps released" value="'+escapeHtml(existing?existing.title:'')+'"></div>'
    + '<div class="form-row">'
    + '<div class="form-group"><label>Category</label><select id="fNewsTag">'+tagOptions+'</select></div>'
    + '<div class="form-group"><label>Date</label><input type="text" id="fNewsDate" placeholder="e.g. Jul 3, 2026" value="'+escapeHtml(existing?existing.date:friendlyToday())+'"></div>'
    + '</div>'
    + '<div class="form-group"><label>Content</label><textarea id="fNewsBody" placeholder="Write the announcement details…" style="min-height:110px">'+escapeHtml(existing ? existing.content:'')+'</textarea></div>'
    + newsImageUploadHtml(existing && existing.image ? [existing.image] : [])
    + '<div class="form-error" id="fNewsError">Please enter a title and content for the announcement.</div>';

  var getImagesData = null;
  openModal(existing ? 'Update Announcement' : 'New Announcement', bodyHtml, async function(){
    var title = document.getElementById('fNewsTitle').value.trim();
    var tag = document.getElementById('fNewsTag').value;
    var date = document.getElementById('fNewsDate').value.trim() || friendlyToday();
    var body = document.getElementById('fNewsBody').value.trim();
    if(!title || !body){
      document.getElementById('fNewsError').classList.add('show');
      return false;
    }
    var images = getImagesData ? getImagesData() : [];
 
    // Need fixing
  
    if(existing){

    const newsObject = {

        id: existing.id,
        title: title,
        category: tag,
        date: date,
        summary: body.substring(0,120),
        content: body,
        image: images.length ? images[0] : "",
        attachment: existing.attachment || "",
        featured: existing.featured || false,
        status: existing.status || "Published",
        author: existing.author || "PPDO"

    };

    if(!newsObject.id){
        alert("Cannot update: this announcement has no ID.");
        return false;
    }

    try{

        const result = await updateNewsInDatabase(newsObject);

        console.log("Update Result:", result);

        if(result && result.success){
            Object.assign(existing, newsObject); // reflect the change immediately, even if the reload below is slow/fails
            await loadNews();
        }else{
            alert((result && result.message) || "Failed to update announcement.");
            return false; // keep the modal open so the edits aren't lost
        }

    }catch(err){

        console.error(err);
        alert("Failed to update announcement. Please check your connection and try again.");
        return false;

    }

}else{

    const newsObject = {

        title: title,
        category: tag,
        date: date,
        summary: body.substring(0,120),
        content: body,
        image: images.length ? images[0] : "",
        attachment: "",
        featured: false,
        status: "Published",
        author: "PPDO"

    };

    try{

        const result = await saveNewsToDatabase(newsObject);

        console.log(result);

        if(result && result.success){
            await loadNews();
        }else{
            alert((result && result.message) || "Failed to publish announcement.");
            return false; // keep the modal open so the entry isn't lost
        }

    }catch(err){

        console.error(err);
        alert("Failed to publish announcement. Please check your connection and try again.");
        return false;

    }

}
  });
  // wire the image upload after the modal body is in the DOM
  getImagesData = wireNewsImageUpload(
    existing && existing.image ? [existing.image] : []
);
}

/* Pick-then-edit / pick-then-delete flows for the top toolbar buttons */
function newsPickerOptions(){
  return newsData.map(function(n){
    return '<option value="'+n.id+'">'+escapeHtml(n.title)+' — '+escapeHtml(n.date)+'</option>';
  }).join('');
}

function openNewsEditPicker(){
  if(!newsData.length){
    alert('There are no announcements to update yet.');
    return;
  }
  var bodyHtml = '<div class="form-group"><label>Choose an announcement to update</label><select id="fNewsPickEdit">'+newsPickerOptions()+'</select></div>'
    + '<div class="form-hint">You\'ll be able to edit the title, category, date, content, and photos on the next screen.</div>';
  openModal('Update Announcement', bodyHtml, function(){
    var id = document.getElementById('fNewsPickEdit').value;
    openNewsForm(id);
  }, {saveLabel:'Continue'});
}

function openNewsDeletePicker(){
  if(!newsData.length){
    alert('There are no announcements to delete.');
    return;
  }
  var bodyHtml = '<div class="form-group"><label>Choose an announcement to delete</label><select id="fNewsPickDelete">'+newsPickerOptions()+'</select></div>'
    + '<div class="form-hint">This will permanently remove the announcement from the site.</div>';
  openModal('Delete Announcement', bodyHtml, async function(){
    var id = document.getElementById('fNewsPickDelete').value;
    var item = newsData.find(function(n){ return String(n.id) === String(id); });
    if(item && !confirm('Delete "'+item.title+'"? This cannot be undone.')) return false;
    try{
      const result = await deleteNewsFromDatabase(id);
      if(result && result.success){
        await loadNews();
      }else{
        alert((result && result.message) || "Failed to delete announcement.");
        return false;
      }
    }catch(err){
      console.error(err);
      alert("Failed to delete announcement. Please check your connection and try again.");
      return false;
    }
  }, {saveLabel:'Continue', saveClass:'btn btn-danger'});
}

/* Read-only detail modal, opened by clicking a news card */
function openNewsDetail(id){
  var n = newsData.find(function(x){ return x.id === id; });
  if(!n) return;
  var imgs = n.image ? [n.image] : [];
  var galleryHtml;
  if(imgs.length){
    var mainStyle = ' style="background-image:url(\''+imgs[0]+'\')"';
    var thumbs = imgs.length > 1
      ? '<div class="news-gallery-thumbs">'+imgs.map(function(src, idx){
          return '<img src="'+src+'" data-gallery-idx="'+idx+'" class="'+(idx===0?'active':'')+'">';
        }).join('')+'</div>'
      : '';
    galleryHtml = '<div class="news-gallery"><div class="news-gallery-main" id="newsGalleryMain"'+mainStyle+'></div>'+thumbs+'</div>';
  } else {
    galleryHtml = '<div class="news-detail-thumb"></div>';
  }
  var adminActions = adminSignedIn
    ? '<div class="news-detail-admin-actions">'
      + '<button class="btn btn-outline" id="fNewsDetailEdit">Update this announcement</button>'
      + '<button class="btn btn-danger" id="fNewsDetailDelete">Delete this announcement</button>'
      + '</div>'
    : '';
  var bodyHtml =
    galleryHtml
    + '<div class="news-detail-meta"><span class="news-detail-tag">'
    + escapeHtml(n.category)
    + '</span><span class="news-detail-date">'
    + new Date(n.date).toLocaleDateString('en-US',{
        year:'numeric',
        month:'long',
        day:'numeric'
    })
    + '</span></div>'
    + '<div class="news-detail-body">'
    + escapeHtml(n.content)
    + '</div>'
    + adminActions;

  openModal(n.title, bodyHtml, null, {wide:true, hideFoot:true});

  if(imgs.length > 1){
    var mainEl = document.getElementById('newsGalleryMain');
    modalBody.querySelectorAll('[data-gallery-idx]').forEach(function(thumb){
      thumb.addEventListener('click', function(){
        modalBody.querySelectorAll('[data-gallery-idx]').forEach(t=>t.classList.remove('active'));
        thumb.classList.add('active');
        mainEl.style.backgroundImage = "url('"+imgs[Number(thumb.dataset.galleryIdx)]+"')";
      });
    });
  }

  var editBtn = document.getElementById('fNewsDetailEdit');
  var delBtn = document.getElementById('fNewsDetailDelete');
  if(editBtn) editBtn.addEventListener('click', function(){
    closeModal();
    openNewsForm(n.id);
  });
  if(delBtn) delBtn.addEventListener('click', async function(){
    if(!confirm('Delete "'+n.title+'"? This cannot be undone.')) return;
    delBtn.disabled = true;
    try{
      const result = await deleteNewsFromDatabase(n.id);
      if(result && result.success){
        closeModal();
        await loadNews();
      }else{
        alert((result && result.message) || "Failed to delete announcement.");
        delBtn.disabled = false;
      }
    }catch(err){
      console.error(err);
      alert("Failed to delete announcement. Please check your connection and try again.");
      delBtn.disabled = false;
    }
  });
}

/* Wire the three admin toolbar buttons on the News page */
(function(){
  var btnNewPost = document.getElementById('btnNewPost');
  var btnEdit = document.getElementById('btnEdit');
  var btnDelete = document.getElementById('btnDelete');
  if(btnNewPost) btnNewPost.addEventListener('click', function(){ openNewsForm(null); });
  if(btnEdit) btnEdit.addEventListener('click', openNewsEditPicker);
  if(btnDelete) btnDelete.addEventListener('click', openNewsDeletePicker);
})();

/* ---------------- Office calendar ---------------- */
var calToday = new Date();
var calViewYear = calToday.getFullYear();
var calViewMonth = calToday.getMonth();
var calSelectedKey = dateKey(calToday.getFullYear(), calToday.getMonth(), calToday.getDate());

var calEvents = {};
(function seedCalendarEvents(){
  var t = calToday;
  var k1 = dateKey(t.getFullYear(), t.getMonth(), t.getDate());
  var k2 = dateKey(t.getFullYear(), t.getMonth(), Math.min(t.getDate()+3, 28));
  var k3 = dateKey(t.getFullYear(), t.getMonth(), Math.min(t.getDate()+7, 28));
  calEvents[k1] = [{id:'e1', name:'PDC Mid-Year Review', start:'9:00 AM', end:'12:00 PM', description:'Public consultation at the Capitol Social Hall.'}];
  calEvents[k2] = [{id:'e2', name:'Site Inspection — Ubay Coastal Road', start:'8:00 AM', end:'4:00 PM', description:'PDMU field visit with contractor.'}];
  calEvents[k3] = [
    {id:'e3', name:'Budget Hearing', start:'1:00 PM', end:'3:00 PM', description:'CY2027 PDIP budget deliberation.'},
    {id:'e4', name:'GIS Unit Training', start:'9:00 AM', end:'11:00 AM', description:'New hazard-mapping tool walkthrough.'}
  ];
})();
var calEventSeq = 5;

var weekdayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
var monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function renderCalWeekdayHeader(){
  document.getElementById('calWeekdays').innerHTML = weekdayNames.map(function(w){
    return '<div class="cal-weekday">'+w+'</div>';
  }).join('');
}

function renderCalendar(){
  document.getElementById('calMonthLabel').textContent = monthNames[calViewMonth] + ' ' + calViewYear;
  var grid = document.getElementById('calGrid');
  var firstDow = new Date(calViewYear, calViewMonth, 1).getDay();
  var daysInMonth = new Date(calViewYear, calViewMonth+1, 0).getDate();
  var daysInPrevMonth = new Date(calViewYear, calViewMonth, 0).getDate();
  var todayKey = dateKey(calToday.getFullYear(), calToday.getMonth(), calToday.getDate());

  var cells = [];
  for(var i=firstDow-1; i>=0; i--){
    var pm = calViewMonth - 1, py = calViewYear;
    if(pm < 0){ pm = 11; py--; }
    cells.push({day: daysInPrevMonth-i, y:py, m:pm, outside:true});
  }
  for(var d=1; d<=daysInMonth; d++){
    cells.push({day:d, y:calViewYear, m:calViewMonth, outside:false});
  }
  var nm = calViewMonth + 1, ny = calViewYear;
  if(nm > 11){ nm = 0; ny++; }
  var trailDay = 1;
  while(cells.length % 7 !== 0){
    cells.push({day: trailDay++, y:ny, m:nm, outside:true});
  }

  var html = '';
  cells.forEach(function(cell){
    var key = dateKey(cell.y, cell.m, cell.day);
    var dayEvents = calEvents[key] || [];
    var classes = 'cal-day' + (cell.outside ? ' outside' : '') + (key === todayKey ? ' today' : '');
    var chips = dayEvents.slice(0,2).map(function(ev){
      return '<div class="cal-event-chip">'+escapeHtml(ev.name)+'</div>';
    }).join('');
    if(dayEvents.length > 2){
      chips += '<div class="cal-event-chip more">+'+(dayEvents.length-2)+' more</div>';
    }
    html += '<div class="'+classes+'" data-key="'+key+'"><div class="cal-daynum">'+cell.day+'</div>'+chips+'</div>';
  });
  grid.innerHTML = html;

  grid.querySelectorAll('.cal-day').forEach(function(cellEl){
    cellEl.addEventListener('click', function(){
      calSelectedKey = cellEl.dataset.key;
      renderCalEventList();
    });
  });

  renderCalEventList();
}

function friendlyDateLabel(key){
  var parts = key.split('-').map(Number);
  var d = new Date(parts[0], parts[1]-1, parts[2]);
  return d.toLocaleDateString(undefined, {weekday:'long', month:'long', day:'numeric', year:'numeric'});
}

function renderCalEventList(){
  document.getElementById('calSelectedLabel').textContent = friendlyDateLabel(calSelectedKey);
  var list = calEvents[calSelectedKey] || [];
  var container = document.getElementById('calEventList');
  if(!list.length){
    container.innerHTML = '<p style="font-size:12.5px; color:var(--ink-soft); margin:6px 0 0;">No events scheduled for this day.</p>';
    return;
  }
  container.innerHTML = list.map(function(ev){
    return '<div class="cal-event-list-item">'
      + '<div style="display:flex; gap:8px;"><div class="cal-event-dot"></div>'
      + '<div><h5 style="margin:0 0 2px; font-size:13px;">'+escapeHtml(ev.name)+'</h5>'
      + '<span style="font-size:11.5px; color:var(--ink-soft);">'+escapeHtml(ev.start)+' – '+escapeHtml(ev.end)+'</span>'
      + (ev.description ? '<p style="font-size:12px; color:var(--ink-soft); margin:4px 0 0;">'+escapeHtml(ev.description)+'</p>' : '')
      + '</div></div>'
      + '<div class="cal-event-actions"><button data-edit="'+ev.id+'" title="Edit">✎</button><button data-del="'+ev.id+'" title="Delete">✕</button></div>'
      + '</div>';
  }).join('');

  container.querySelectorAll('[data-edit]').forEach(function(btn){
    btn.addEventListener('click', function(){ openEventForm(calSelectedKey, btn.dataset.edit); });
  });
  container.querySelectorAll('[data-del]').forEach(function(btn){
    btn.addEventListener('click', function(){
      calEvents[calSelectedKey] = (calEvents[calSelectedKey]||[]).filter(function(ev){ return ev.id !== btn.dataset.del; });
      if(!calEvents[calSelectedKey].length) delete calEvents[calSelectedKey];
      renderCalendar();
    });
  });
}

function openEventForm(dateKeyForForm, eventId){
  var existing = eventId ? (calEvents[dateKeyForForm]||[]).find(function(ev){ return ev.id === eventId; }) : null;
  var bodyHtml =
    '<div class="form-group"><label>Event date</label><input type="date" id="fEventDate" value="'+(dateKeyForForm||calSelectedKey)+'"></div>'
    + '<div class="form-group"><label>Event name</label><input type="text" id="fEventName" placeholder="e.g. Budget Hearing" value="'+escapeHtml(existing?existing.name:'')+'"></div>'
    + '<div class="form-row">'
    + '<div class="form-group"><label>Start time</label><input type="text" id="fEventStart" placeholder="9:00 AM" value="'+escapeHtml(existing?existing.start:'')+'"></div>'
    + '<div class="form-group"><label>End time</label><input type="text" id="fEventEnd" placeholder="11:00 AM" value="'+escapeHtml(existing?existing.end:'')+'"></div>'
    + '</div>'
    + '<div class="form-group"><label>Description</label><textarea id="fEventDesc" placeholder="Optional details">'+escapeHtml(existing?existing.description:'')+'</textarea></div>'
    + '<div class="form-error" id="fEventError">Please enter an event name and date.</div>';

  openModal(existing ? 'Edit Event' : 'Add Event', bodyHtml, function(){
    var newKey = document.getElementById('fEventDate').value;
    var name = document.getElementById('fEventName').value.trim();
    var start = document.getElementById('fEventStart').value.trim() || 'All day';
    var end = document.getElementById('fEventEnd').value.trim() || '';
    var desc = document.getElementById('fEventDesc').value.trim();
    if(!newKey || !name){
      document.getElementById('fEventError').classList.add('show');
      return false;
    }
    if(existing){
      calEvents[dateKeyForForm] = (calEvents[dateKeyForForm]||[]).filter(function(ev){ return ev.id !== eventId; });
      if(!calEvents[dateKeyForForm].length) delete calEvents[dateKeyForForm];
      if(!calEvents[newKey]) calEvents[newKey] = [];
      calEvents[newKey].push({id:eventId, name:name, start:start, end:end, description:desc});
    } else {
      if(!calEvents[newKey]) calEvents[newKey] = [];
      calEvents[newKey].push({id:'e'+(calEventSeq++), name:name, start:start, end:end, description:desc});
    }
    calSelectedKey = newKey;
    var parts = newKey.split('-').map(Number);
    calViewYear = parts[0]; calViewMonth = parts[1]-1;
    renderCalendar();
  });
}

document.getElementById('btnNewEvent').addEventListener('click', function(){ openEventForm(calSelectedKey, null); });
document.getElementById('btnCalPrev').addEventListener('click', function(){
  calViewMonth--; if(calViewMonth < 0){ calViewMonth = 11; calViewYear--; } renderCalendar();
});
document.getElementById('btnCalNext').addEventListener('click', function(){
  calViewMonth++; if(calViewMonth > 11){ calViewMonth = 0; calViewYear++; } renderCalendar();
});
document.getElementById('btnCalToday').addEventListener('click', function(){
  calViewYear = calToday.getFullYear(); calViewMonth = calToday.getMonth();
  calSelectedKey = dateKey(calToday.getFullYear(), calToday.getMonth(), calToday.getDate());
  renderCalendar();
});
renderCalWeekdayHeader();
renderCalendar();

/* ---------------- Employee status ---------------- */
var statusMeta = {
  'In Office': {cls:'status-in-office'},
  'Traveling': {cls:'status-traveling'},
  'On Leave': {cls:'status-on-leave'},
  'Field Work': {cls:'status-field-work'},
  'Work From Home': {cls:'status-wfh'}
};
function initials(name){
  return name.split(' ').filter(Boolean).slice(0,2).map(function(p){ return p[0].toUpperCase(); }).join('');
}
var employees = [
  {id:'p1', name:'Maria L. Santos', division:'Infrastructure Development Sector', status:'In Office', note:'Capitol Bldg., 2nd Flr.', updated:'Today, 8:02 AM'},
  {id:'p2', name:'Rodel A. Cruz', division:'Project Development Unit', status:'Traveling', note:'Site inspection — Ubay Coastal Road', updated:'Today, 7:15 AM'},
  {id:'p3', name:'Angeline P. Reyes', division:'GIS Unit', status:'Field Work', note:'Mapping survey, Talibon', updated:'Yesterday, 4:40 PM'},
  {id:'p4', name:'Herbert D. Uy', division:'Development Administration Sector', status:'On Leave', note:'Vacation leave, back Jul 7', updated:'Jun 30, 3:00 PM'},
  {id:'p5', name:'Jocelyn M. Torres', division:'Social Development Sector', status:'In Office', note:'Capitol Bldg., 2nd Flr.', updated:'Today, 8:10 AM'}
];
var employeeSeq = 6;

function nowLabel(){
  var d = new Date();
  return 'Today, ' + d.toLocaleTimeString(undefined, {hour:'numeric', minute:'2-digit'});
}

function empRow(e){
  var meta = statusMeta[e.status] || statusMeta['In Office'];
  var options = Object.keys(statusMeta).map(function(s){
    return '<option value="'+s+'"'+(s===e.status?' selected':'')+'>'+s+'</option>';
  }).join('');
  return '<tr data-id="'+e.id+'">'
    + '<td><div class="emp-name-cell"><div class="emp-avatar" data-emp-avatar="'+e.id+'">'+initials(e.name)+'</div><span class="inline-editable" contenteditable="true" data-emp-name="'+e.id+'">'+escapeHtml(e.name)+'</span></div></td>'
    + '<td><span class="inline-editable" contenteditable="true" data-emp-division="'+e.id+'">'+escapeHtml(e.division)+'</span></td>'
    + '<td><select class="status-select '+meta.cls+'" data-emp-status="'+e.id+'">'+options+'</select></td>'
    + '<td><input type="text" value="'+escapeHtml(e.note)+'" data-emp-note="'+e.id+'" style="border:1px solid var(--line); border-radius:7px; padding:6px 8px; font-size:12.5px; width:100%; max-width:220px;"></td>'
    + '<td style="font-size:12px; color:var(--ink-soft);" data-emp-updated="'+e.id+'">'+escapeHtml(e.updated)+'</td>'
    + '<td><button class="row-remove" data-emp-remove="'+e.id+'" title="Remove">✕</button></td>'
    + '</tr>';
}

function renderEmployees(){
  document.getElementById('employeeTable').innerHTML = employees.length
    ? employees.map(empRow).join('')
    : '<tr><td colspan="6" style="text-align:center; color:var(--ink-soft);">No personnel on record yet.</td></tr>';
  wireEmployeeRows();
  renderStaffDirectory();
  updatePersonnelStat();
}

function updatePersonnelStat(){
  var statEl = document.getElementById('statPersonnel');
  if(!statEl) return;
  statEl.textContent = employees.length;
  var card = statEl.closest('.stat-card');
  if(card){
    card.classList.remove('stat-saved-flash');
    void card.offsetWidth;
    card.classList.add('stat-saved-flash');
  }
}

/* ---------------- Public staff directory (mirrors the employees list above) ---------------- */
function staffCard(e){
  var meta = statusMeta[e.status] || statusMeta['In Office'];
  return '<div class="card" style="display:flex; flex-direction:column; gap:12px; padding:16px;">'
    + '<div style="display:flex; align-items:center; gap:12px;">'
    + '<div class="emp-avatar" style="width:44px; height:44px; font-size:15px;">'+initials(e.name)+'</div>'
    + '<div style="min-width:0;"><h4 style="margin:0; font-size:14px;">'+escapeHtml(e.name)+'</h4><p style="margin:2px 0 0; font-size:12px; color:var(--ink-soft);">'+escapeHtml(e.division)+'</p></div>'
    + '</div>'
    + '<div style="display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap;">'
    + '<span class="status-badge '+meta.cls+'">'+escapeHtml(e.status)+'</span>'
    + '<span style="font-size:11.5px; color:var(--ink-soft); text-align:right;">'+escapeHtml(e.note)+'</span>'
    + '</div>'
    + '</div>';
}
function renderStaffDirectory(){
  var grid = document.getElementById('staffDirectoryGrid');
  if(!grid) return;
  var searchInput = document.getElementById('staffSearchInput');
  var q = normalize(searchInput ? searchInput.value : '');
  var list = employees.filter(function(e){
    if(!q) return true;
    return normalize(e.name).indexOf(q) !== -1 || normalize(e.division).indexOf(q) !== -1;
  });
  grid.innerHTML = list.length
    ? list.map(staffCard).join('')
    : '<p style="color:var(--ink-soft); font-size:13px;">No staff match your search.</p>';
}
(function(){
  var searchInput = document.getElementById('staffSearchInput');
  if(searchInput) searchInput.addEventListener('input', renderStaffDirectory);
})();

function wireEmployeeRows(){
  document.querySelectorAll('[data-emp-status]').forEach(function(sel){
    sel.addEventListener('change', function(){
      var emp = employees.find(function(x){ return x.id === sel.dataset.empStatus; });
      if(!emp) return;
      emp.status = sel.value;
      emp.updated = nowLabel();
      var meta = statusMeta[emp.status] || statusMeta['In Office'];
      sel.className = 'status-select ' + meta.cls;
      var updatedCell = document.querySelector('[data-emp-updated="'+emp.id+'"]');
      if(updatedCell) updatedCell.textContent = emp.updated;
      renderStaffDirectory();
    });
  });
  document.querySelectorAll('[data-emp-note]').forEach(function(inp){
    inp.addEventListener('change', function(){
      var emp = employees.find(function(x){ return x.id === inp.dataset.empNote; });
      if(!emp) return;
      emp.note = inp.value;
      emp.updated = nowLabel();
      var updatedCell = document.querySelector('[data-emp-updated="'+emp.id+'"]');
      if(updatedCell) updatedCell.textContent = emp.updated;
      renderStaffDirectory();
    });
  });
  document.querySelectorAll('[data-emp-name]').forEach(function(span){
    wireInlineEdit(span, {
      onSave: function(val){
        var emp = employees.find(function(x){ return x.id === span.dataset.empName; });
        if(!emp) return;
        emp.name = val;
        emp.updated = nowLabel();
        var avatar = document.querySelector('[data-emp-avatar="'+emp.id+'"]');
        if(avatar) avatar.textContent = initials(emp.name);
        var updatedCell = document.querySelector('[data-emp-updated="'+emp.id+'"]');
        if(updatedCell) updatedCell.textContent = emp.updated;
        renderStaffDirectory();
      }
    });
  });
  document.querySelectorAll('[data-emp-division]').forEach(function(span){
    wireInlineEdit(span, {
      onSave: function(val){
        var emp = employees.find(function(x){ return x.id === span.dataset.empDivision; });
        if(!emp) return;
        emp.division = val;
        emp.updated = nowLabel();
        var updatedCell = document.querySelector('[data-emp-updated="'+emp.id+'"]');
        if(updatedCell) updatedCell.textContent = emp.updated;
        renderStaffDirectory();
      }
    });
  });
  document.querySelectorAll('[data-emp-remove]').forEach(function(btn){
    btn.addEventListener('click', function(){
      employees = employees.filter(function(x){ return x.id !== btn.dataset.empRemove; });
      renderEmployees();
    });
  });
}

function openEmployeeForm(){
  var statusOptions = Object.keys(statusMeta).map(function(s){ return '<option value="'+s+'">'+s+'</option>'; }).join('');
  var bodyHtml =
    '<div class="form-group"><label>Full name</label><input type="text" id="fEmpName" placeholder="e.g. Juan D. Dela Cruz"></div>'
    + '<div class="form-group"><label>Division</label><input type="text" id="fEmpDivision" placeholder="e.g. GIS Unit"></div>'
    + '<div class="form-group"><label>Status</label><select id="fEmpStatus">'+statusOptions+'</select></div>'
    + '<div class="form-group"><label>Note / location</label><input type="text" id="fEmpNote" placeholder="e.g. Capitol Bldg., 2nd Flr."></div>'
    + '<div class="form-error" id="fEmpError">Please enter the employee\'s name.</div>';

  openModal('Add Employee', bodyHtml, function(){
    var name = document.getElementById('fEmpName').value.trim();
    var division = document.getElementById('fEmpDivision').value.trim() || 'Unassigned';
    var status = document.getElementById('fEmpStatus').value;
    var note = document.getElementById('fEmpNote').value.trim();
    if(!name){
      document.getElementById('fEmpError').classList.add('show');
      return false;
    }
    employees.push({id:'p'+(employeeSeq++), name:name, division:division, status:status, note:note, updated:nowLabel()});
    renderEmployees();
  });
}
document.getElementById('btnNewEmployee').addEventListener('click', openEmployeeForm);
renderEmployees();

/* ---------------- Visitor log ---------------- */
var visitors = [
  {id:'v1', name:'Engr. Paolo Bautista', org:'DPWH — Tarlac District Office', purpose:'Coordination meeting on FMR alignment', datetime:'Jul 2, 2026 · 9:30 AM', host:'Project Development Unit'},
  {id:'v2', name:'Sr. Fely Ramos', org:'Tarlac State University', purpose:'Data request — poverty indicators', datetime:'Jul 2, 2026 · 10:15 AM', host:'Social Development Sector'},
  {id:'v3', name:'Atty. Marco Villanueva', org:'Provincial Legal Office', purpose:'Review of PDC Resolution No. 014', datetime:'Jul 1, 2026 · 2:00 PM', host:'PPDC Secretariat'}
];
var visitorSeq = 4;

function visRow(v){
  return '<tr data-id="'+v.id+'">'
    + '<td><span class="inline-editable" contenteditable="true" data-vis-field="name" data-vis-id="'+v.id+'">'+escapeHtml(v.name)+'</span></td>'
    + '<td><span class="inline-editable" contenteditable="true" data-vis-field="org" data-vis-id="'+v.id+'">'+escapeHtml(v.org)+'</span></td>'
    + '<td><span class="inline-editable" contenteditable="true" data-vis-field="purpose" data-vis-id="'+v.id+'">'+escapeHtml(v.purpose)+'</span></td>'
    + '<td style="font-size:12.5px; color:var(--ink-soft);"><span class="inline-editable" contenteditable="true" data-vis-field="datetime" data-vis-id="'+v.id+'">'+escapeHtml(v.datetime)+'</span></td>'
    + '<td><span class="inline-editable" contenteditable="true" data-vis-field="host" data-vis-id="'+v.id+'">'+escapeHtml(v.host)+'</span></td>'
    + '<td><button class="row-remove" data-vis-remove="'+v.id+'" title="Remove">✕</button></td>'
    + '</tr>';
}
function renderVisitors(){
  document.getElementById('visitorTable').innerHTML = visitors.length
    ? visitors.map(visRow).join('')
    : '<tr><td colspan="6" style="text-align:center; color:var(--ink-soft);">No visitors logged yet.</td></tr>';
  wireVisitorRows();
}

function wireVisitorRows(){
  document.querySelectorAll('[data-vis-field]').forEach(function(span){
    wireInlineEdit(span, {
      onSave: function(val){
        var v = visitors.find(function(x){ return x.id === span.dataset.visId; });
        if(!v) return;
        v[span.dataset.visField] = val;
      }
    });
  });
  document.querySelectorAll('[data-vis-remove]').forEach(function(btn){
    btn.addEventListener('click', function(){
      visitors = visitors.filter(function(x){ return x.id !== btn.dataset.visRemove; });
      renderVisitors();
    });
  });
}

function openVisitorForm(){
  var todayStr = nowLabel();
  var bodyHtml =
    '<div class="form-group"><label>Visitor name</label><input type="text" id="fVisName" placeholder="e.g. Engr. Juan Dela Cruz"></div>'
    + '<div class="form-group"><label>Organization</label><input type="text" id="fVisOrg" placeholder="e.g. DPWH — Tarlac District Office"></div>'
    + '<div class="form-group"><label>Purpose of visit</label><textarea id="fVisPurpose" placeholder="e.g. Coordination meeting on road alignment"></textarea></div>'
    + '<div class="form-row">'
    + '<div class="form-group"><label>Date &amp; time</label><input type="text" id="fVisDatetime" placeholder="Jul 2, 2026 · 9:30 AM" value="'+escapeHtml(todayStr)+'"></div>'
    + '<div class="form-group"><label>Host / division</label><input type="text" id="fVisHost" placeholder="e.g. GIS Unit"></div>'
    + '</div>'
    + '<div class="form-error" id="fVisError">Please enter the visitor\'s name and organization.</div>';

  openModal('Log Visitor', bodyHtml, function(){
    var name = document.getElementById('fVisName').value.trim();
    var org = document.getElementById('fVisOrg').value.trim();
    var purpose = document.getElementById('fVisPurpose').value.trim() || '—';
    var datetime = document.getElementById('fVisDatetime').value.trim() || nowLabel();
    var host = document.getElementById('fVisHost').value.trim() || 'PPDO Front Desk';
    if(!name || !org){
      document.getElementById('fVisError').classList.add('show');
      return false;
    }
    visitors.unshift({id:'v'+(visitorSeq++), name:name, org:org, purpose:purpose, datetime:datetime, host:host});
    renderVisitors();
  });
}
document.getElementById('btnNewVisitor').addEventListener('click', openVisitorForm);
renderVisitors();

/* ---------------- Editable admin stat cards ---------------- */
(function(){
  var editableIds = ['statApprovals','statRequests','statUptime'];
  editableIds.forEach(function(id){
    var el = document.getElementById(id);
    if(!el) return;
    var lastGoodValue = el.textContent.trim();

    el.addEventListener('keydown', function(e){
      if(e.key === 'Enter'){ e.preventDefault(); el.blur(); }
      if(e.key === 'Escape'){ el.textContent = lastGoodValue; el.blur(); }
    });

    el.addEventListener('blur', function(){
      var raw = el.textContent.trim();
      var cleaned = raw.replace(/[^\d.]/g, '');
      if(cleaned === '' || isNaN(Number(cleaned))){
        el.textContent = lastGoodValue;
        return;
      }
      var num = Number(cleaned);
      var display = (cleaned.indexOf('.') !== -1) ? num.toString() : String(Math.round(num));
      el.textContent = display;
      lastGoodValue = display;

      var card = el.closest('.stat-card');
      if(card){
        card.classList.remove('stat-saved-flash');
        void card.offsetWidth;
        card.classList.add('stat-saved-flash');
      }
    });
  });
})();

/* =======================================================================
   Division Dashboards — live pull from each division's Google Sheet,
   backed by:
     - Firebase Authentication: a real login per division (only that
       division's own account can connect/change its sheet).
     - Firestore: stores each division's connected sheet centrally, so
       every visitor sees it (not just the browser that connected it).

   Each of the 5 PPDO divisions gets its own widget, embedded directly on
   its own page (sec-div-<slug>) instead of a separate hidden dashboard
   page. All 5 widgets share one Firebase auth session: sign in once as
   e.g. pdip@ppdo.gov.ph and the "Connect sheet" button appears only on
   the PDIP page (the one that account is allowed to edit); the other 4
   pages stay read-only for that same signed-in session.
   ======================================================================= */
(function(){
  // slug must match each page's section id (sec-div-<slug>) and the
  // divStatus-<slug> / btnDivRefresh-<slug> / btnDivConnect-<slug> /
  // divBody-<slug> element ids in index.html. DIVISION_ACCOUNTS,
  // signedInSlug, and fbAuth all come from the site-wide auth controller
  // above — sign-in now happens once, from the topbar, not per division.
  var DIVISIONS = [
    {slug: 'admin',      name: 'Admin, Finance and Support'},
    {slug: 'pdip',       name: 'Project Development and Investment Programming'},
    {slug: 'research',   name: 'Research, GIS and Data Management'},
    {slug: 'monitoring', name: 'Monitoring and Evaluation, Reporting'},
    {slug: 'planning',   name: 'Development Planning'}
  ];

  var db = (typeof firebase !== 'undefined') ? firebase.firestore() : null;

  var lastFetchedAt = {};  // slug -> display time string

  /* ---------------- Firestore-backed config (shared, not per-browser) ---------------- */
  function getConfig(slug){
    if(!db) return Promise.resolve(null);
    return db.collection('divisionSheets').doc(slug).get().then(function(doc){
      return doc.exists ? doc.data() : null;
    }).catch(function(){ return null; });
  }
  function setConfig(slug, cfg){
    if(!db) return Promise.resolve();
    cfg = Object.assign({}, cfg, {updatedAt: new Date().toISOString()});
    return db.collection('divisionSheets').doc(slug).set(cfg);
  }
  function clearConfig(slug){
    if(!db) return Promise.resolve();
    return db.collection('divisionSheets').doc(slug).delete();
  }

  function extractSheetId(input){
    input = (input || '').trim();
    var m = input.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if(m) return m[1];
    if(/^[a-zA-Z0-9-_]{20,}$/.test(input)) return input; // pasted raw ID
    return null;
  }

  // Google's gviz/tq endpoint doesn't send CORS headers, so a plain fetch()
  // gets blocked by the browser regardless of sharing settings. We load it
  // the way Google's own embed widgets do: as a <script> tag (JSONP), which
  // isn't subject to CORS, using the built-in "google.visualization.Query.setResponse"
  // callback name.
  function loadGvizViaJsonp(cfg){
    return new Promise(function(resolve, reject){
      var timeoutId;
      var scriptEl;
      function cleanup(){
        window.google.visualization.Query.setResponse = function(){};
        if(scriptEl && scriptEl.parentNode) scriptEl.parentNode.removeChild(scriptEl);
        clearTimeout(timeoutId);
      }
      window.google = window.google || {};
      window.google.visualization = window.google.visualization || {};
      window.google.visualization.Query = window.google.visualization.Query || {};
      window.google.visualization.Query.setResponse = function(json){
        cleanup();
        resolve(json);
      };

      var url = 'https://docs.google.com/spreadsheets/d/' + cfg.sheetId + '/gviz/tq?tqx=out:json';
      if(cfg.gid) url += '&gid=' + encodeURIComponent(cfg.gid);
      if(cfg.sheetName) url += '&sheet=' + encodeURIComponent(cfg.sheetName);

      scriptEl = document.createElement('script');
      scriptEl.src = url;
      scriptEl.onerror = function(){
        cleanup();
        reject(new Error('The browser could not reach that sheet at all — double-check the link is correct and the sheet still exists.'));
      };
      timeoutId = setTimeout(function(){
        cleanup();
        reject(new Error('Timed out waiting for a response. The sheet may not be shared as "Anyone with the link", or the tab name/gid is wrong.'));
      }, 12000);
      document.body.appendChild(scriptEl);
    });
  }

  function extractTable(json){
    if(json.status === 'error'){
      var msg = (json.errors && json.errors[0] && json.errors[0].detailed_message) || 'Sheet returned an error.';
      throw new Error(msg);
    }
    var table = json.table;
    var cols = table.cols.map(function(c, i){ return c.label || c.id || ('Column ' + (i+1)); });
    var rows = table.rows.map(function(r){
      return (r.c || []).map(function(cell){
        if(!cell) return '';
        return (cell.f !== undefined && cell.f !== null) ? cell.f : cell.v;
      });
    });
    return {cols: cols, rows: rows};
  }

  // The gviz JSONP callback is a single global, so two widgets fetching
  // at once would clobber each other. Queue fetches so they run one at a
  // time across all 5 widgets.
  var fetchQueue = Promise.resolve();
  function queuedLoadGviz(cfg){
    var result = fetchQueue.then(function(){ return loadGvizViaJsonp(cfg); });
    fetchQueue = result.catch(function(){ /* keep queue alive after an error */ });
    return result;
  }

  function isNumericColumn(rows, idx){
    if(!rows.length) return false;
    var sawNumber = false;
    for(var i=0;i<rows.length;i++){
      var v = rows[i][idx];
      if(typeof v === 'number'){ sawNumber = true; continue; }
      if(v === '' || v == null) continue;
      return false; // a genuine non-numeric, non-blank value disqualifies the column
    }
    // Only count it as numeric if it actually contained real numbers —
    // otherwise a mostly-blank text column (e.g. "Action Taken") would
    // trivially pass and end up charted as an empty, meaningless series.
    return sawNumber;
  }

  /* ---------------- One widget instance per division ---------------- */
  function createWidget(division){
    var slug = division.slug, name = division.name;
    var statusEl = document.getElementById('divStatus-' + slug);
    var connectBtn = document.getElementById('btnDivConnect-' + slug);
    var refreshBtn = document.getElementById('btnDivRefresh-' + slug);
    var bodyEl = document.getElementById('divBody-' + slug);
    if(!bodyEl) return null; // this division's page/widget isn't on this build

    function canConfigure(){
      return signedInSlug === slug;
    }

    function connStatusHtml(cfg){
      if(!cfg) return '<span style="color:var(--ink-soft);">● Not connected</span>';
      var t = lastFetchedAt[slug];
      var label = t ? ('Live · updated ' + t) : 'Live · connected';
      return '<span style="color:var(--green-700); font-weight:600;">● ' + escapeHtml(label) + '</span>';
    }

    function emptyStateHtml(){
      var can = canConfigure();
      return '<div class="card" style="text-align:center; padding:40px 24px;">'
        + '<h3 style="margin-bottom:6px;">No live sheet connected yet</h3>'
        + '<p style="color:var(--ink-soft); font-size:13px; max-width:460px; margin:0 auto 16px;">'
        + (can
            ? 'Connect this division\'s own Google Sheet — data stays in the sheet, this page just mirrors it. Share the sheet as <strong>"Anyone with the link — Viewer"</strong>, then paste the link below.'
            : 'This division hasn\'t connected a live data source yet. Sign in from the topbar as this division to connect one, or check back soon.')
        + '</p>'
        + (can ? '<button class="btn btn-primary" data-action="trigger-div-connect" data-slug="'+slug+'">Connect Google Sheet</button>' : '')
        + '</div>';
    }

    function loadingHtml(){
      return '<div class="card" style="text-align:center; padding:40px 24px; color:var(--ink-soft); font-size:13px;">Fetching latest data from Google Sheets…</div>';
    }

    function errorHtml(msg){
      return '<div class="card" style="padding:24px;">'
        + '<h3 style="color:var(--danger); margin-bottom:6px;">Couldn\'t load this sheet</h3>'
        + '<p style="color:var(--ink-soft); font-size:13px; margin:0 0 12px;">' + escapeHtml(msg) + '</p>'
        + '<p style="color:var(--ink-soft); font-size:12.5px; margin:0;">Double-check that the sheet\'s sharing setting is <strong>"Anyone with the link — Viewer"</strong>, and that the link points to the correct tab. If the sheet must stay private, this division will need a backend sync instead of a direct link.</p>'
        + '</div>';
    }

    function renderTableAndChart(data){
      var cols = data.cols, rows = data.rows;
      var numericIdx = [];
      var labelIdx = 0;
      for(var i=0;i<cols.length;i++){
        if(isNumericColumn(rows, i)) numericIdx.push(i);
      }
      for(var j=0;j<cols.length;j++){
        if(numericIdx.indexOf(j) === -1){ labelIdx = j; break; }
      }
      var chartId = 'divChartCanvas-' + slug;
      var html = '';
      if(numericIdx.length){
        html += '<div class="card" style="margin-bottom:16px;"><h3>' + escapeHtml(name) + ' — at a glance</h3>'
          + '<div class="chart-box"><canvas id="'+chartId+'"></canvas></div></div>';
      }
      html += '<div class="card"><h3 style="margin-bottom:10px;">Sheet data (' + rows.length + ' rows)</h3>'
        + '<div style="overflow-x:auto;">'
        + '<table style="min-width:' + Math.max(700, cols.length * 130) + 'px; white-space:nowrap;"><thead><tr>' + cols.map(function(c){ return '<th>'+escapeHtml(c)+'</th>'; }).join('') + '</tr></thead>'
        + '<tbody>' + rows.slice(0, 200).map(function(r){
            return '<tr>' + r.map(function(v){ return '<td>'+escapeHtml(v===null||v===undefined?'':v)+'</td>'; }).join('') + '</tr>';
          }).join('') + '</tbody></table>'
        + '</div>'
        + (rows.length > 200 ? '<p style="font-size:12px; color:var(--ink-soft); margin-top:10px;">Showing first 200 of '+rows.length+' rows.</p>' : '')
        + '</div>';
      bodyEl.innerHTML = html;

      if(numericIdx.length){
        var labels = rows.map(function(r){ return String(r[labelIdx] != null ? r[labelIdx] : ''); });
        var palette = ['#145C34','#C8971E','#1E5FA8','#B3352A','#0E4A2B','#249456'];
        var datasets = numericIdx.slice(0, 4).map(function(idx, k){
          return {label: cols[idx], data: rows.map(function(r){ return typeof r[idx]==='number' ? r[idx] : null; }), backgroundColor: palette[k % palette.length], borderRadius:6};
        });
        new Chart(document.getElementById(chartId), {
          type:'bar',
          data:{labels:labels, datasets:datasets},
          options:{responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom', labels:{boxWidth:10}}}, scales:{y:{beginAtZero:true, grid:{color:'#EEF3F0'}}, x:{grid:{display:false}}}}
        });
      }
    }

    function fetchAndRender(){
      if(statusEl) statusEl.innerHTML = '<span style="color:var(--ink-soft);">Loading…</span>';
      if(connectBtn) connectBtn.style.display = canConfigure() ? 'inline-flex' : 'none';
      return getConfig(slug).then(function(cfg){
        if(statusEl) statusEl.innerHTML = connStatusHtml(cfg);
        if(connectBtn){
          connectBtn.style.display = canConfigure() ? 'inline-flex' : 'none';
          connectBtn.textContent = cfg ? 'Reconfigure sheet' : 'Connect sheet';
        }

        if(!cfg){
          bodyEl.innerHTML = emptyStateHtml();
          return;
        }
        bodyEl.innerHTML = loadingHtml();
        return queuedLoadGviz(cfg)
          .then(function(json){
            var data = extractTable(json);
            lastFetchedAt[slug] = new Date().toLocaleTimeString(undefined, {hour:'2-digit', minute:'2-digit'});
            if(statusEl) statusEl.innerHTML = connStatusHtml(cfg);
            renderTableAndChart(data);
          })
          .catch(function(err){
            bodyEl.innerHTML = errorHtml(err.message || 'Unknown error while fetching the sheet.');
          });
      });
    }

    function openConnectForm(){
      if(!canConfigure()){
        alert('Sign in from the topbar as "' + name + '" to connect its sheet.');
        return;
      }
      getConfig(slug).then(function(cfg){
        cfg = cfg || {};
        var bodyHtml =
          '<div class="form-group"><label>Google Sheet link</label><input type="text" id="fDivSheetUrl" placeholder="https://docs.google.com/spreadsheets/d/…/edit" value="'+escapeHtml(cfg.rawUrl||'')+'"></div>'
          + '<div class="form-group"><label>Tab / sheet name (optional)</label><input type="text" id="fDivSheetName" placeholder="e.g. Sheet1 — leave blank for the first tab" value="'+escapeHtml(cfg.sheetName||'')+'"></div>'
          + '<div class="form-hint">In Google Sheets: File → Share → General access → "Anyone with the link" → Viewer. Then paste the link here.</div>'
          + '<div class="form-error" id="fDivSheetError">Couldn\'t find a valid sheet ID in that link.</div>';

        openModal('Connect ' + name + "'s Google Sheet", bodyHtml, function(){
          var url = document.getElementById('fDivSheetUrl').value.trim();
          var sheetName = document.getElementById('fDivSheetName').value.trim();
          var id = extractSheetId(url);
          if(!id){
            document.getElementById('fDivSheetError').classList.add('show');
            return false;
          }
          setConfig(slug, {sheetId:id, sheetName:sheetName, rawUrl:url}).then(fetchAndRender);
        }, {saveLabel: cfg.sheetId ? 'Update' : 'Connect'});

        if(cfg.sheetId){
          var disconnectRow = document.createElement('div');
          disconnectRow.innerHTML = '<button type="button" class="btn btn-danger" style="margin-top:4px;" id="fDivDisconnect">Disconnect this sheet</button>';
          document.getElementById('fDivSheetError').insertAdjacentElement('afterend', disconnectRow);
          document.getElementById('fDivDisconnect').addEventListener('click', function(){
            clearConfig(slug).then(function(){
              closeModal();
              fetchAndRender();
            });
          });
        }
      });
    }

    if(refreshBtn) refreshBtn.addEventListener('click', fetchAndRender);
    if(connectBtn) connectBtn.addEventListener('click', openConnectForm);

    return {fetchAndRender: fetchAndRender};
  }

  var widgets = DIVISIONS.map(createWidget).filter(Boolean);
  if(!widgets.length) return; // none of these widgets are present on this page

  function refreshAll(){
    widgets.forEach(function(w){ w.fetchAndRender(); });
  }

  // Sign-in now happens once from the topbar (see the site-wide auth
  // controller above). Whenever that auth state changes — sign in, sign
  // out, switch accounts — just re-fetch/re-render every division widget
  // on this page so each one's "Connect sheet" button and read-only state
  // reflect who's signed in now.
  onAuthStateReady(refreshAll);
  refreshAll();
})();

/* Set the initial role now that every function/data set above is defined */
/* Admin UI state is now driven entirely by the Firebase auth listener above
   (see "Site-wide admin gating"), which fires once automatically on load. */