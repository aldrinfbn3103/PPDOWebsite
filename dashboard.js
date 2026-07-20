/* =======================================================================
   dashboard.js — Site-wide auth (single Firebase sign-in for the whole
   site), admin gating, the Home dashboard (charts/Citizens Charter/
   Municipalities/Sectors), topbar search, editable admin stat cards, and
   the Division Dashboards feature (each divisions live Google Sheet).

   Depends on api.js (escapeHtml, openModal/closeModal, go, normalize) —
   load api.js first. news.js and employees.js read the
   adminSignedIn/signedInSlug globals defined here, so this file loads
   right after api.js and before the feature-specific files.
   ======================================================================= */

/* ---------------- Site-wide auth (real Firebase auth, single sign-in) ----------------
   One shared sign-in, available from the topbar on every page — no more
   per-division login boxes and no more client-side role toggle. Signing in
   as a division's account (e.g. research@ppdo.gov.ph) unlocks editing for
   that division's own page only; everyone else (including other divisions)
   stays read-only there. Administrative Services, plus the staff/admin-only
   action buttons on News and Projects are restricted to the
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
var signedInEmail = null; // email of the logged-in account, if any — read by logActivity() in api.js to attribute log entries
var authInitialized = false; // flips true after the first onAuthStateChanged fires, so that firing (Firebase restoring a persisted session on page load) isn't itself logged as a fresh Login
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

  function applyAdminUI(isAdmin, canView){
    adminSignedIn = isAdmin; // true only for the admin@ppdo.gov.ph account — this still controls edit/write access everywhere
    var canViewAdmin = isAdmin || canView; // any signed-in division account (not just admin) can view Administrative Services

    var adminGate = document.getElementById('adminGate');
    var adminBody = document.getElementById('adminBody');
    var viewOnlyNote = document.getElementById('adminViewOnlyNote');

    // Buttons that create/change data anywhere on the site — admin
    // (Admin, Finance and Support) only. Everyone else who's signed in
    // can still see the Administrative Services page itself, just
    // without these.
    ['btnNewPost','btnDelete','btnNewEvent','btnNewEmployee','btnNewVisitor'].forEach(function(id){
      var el = document.getElementById(id);
      if(el) el.style.display = isAdmin ? 'inline-flex' : 'none';
    });

    if(adminGate){
      adminGate.innerHTML = canViewAdmin ? '' : '<div class="access-note"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l8 3v6c0 5-3.5 8.5-8 11-4.5-2.5-8-6-8-11V5z"/></svg><div><strong>Sign-in required.</strong><br>Administrative Services (personnel records, approvals, and internal workflows) require a PPDO division account. Sign in from the topbar to continue.</div></div>';
    }
    if(adminBody) adminBody.style.display = canViewAdmin ? 'block' : 'none';
    if(viewOnlyNote) viewOnlyNote.style.display = (canViewAdmin && !isAdmin) ? 'flex' : 'none';

    // The three "editable" stat cards (Pending approvals, Open requests,
    // Uptime) only actually accept edits from the admin account — for
    // everyone else they're shown as plain read-only numbers, with the
    // "tap to edit" hover hint switched off too.
    ['statApprovals','statRequests','statUptime'].forEach(function(id){
      var el = document.getElementById(id);
      if(!el) return;
      el.setAttribute('contenteditable', isAdmin ? 'true' : 'false');
      var card = el.closest('.editable-stat');
      if(card) card.classList.toggle('editable-stat', isAdmin);
    });

    if(typeof renderNews === 'function') renderNews();
    if(typeof renderEmployees === 'function') renderEmployees();
    if(typeof renderVisitors === 'function') renderVisitors();
    if(typeof renderCalendar === 'function') renderCalendar();

    // The "Recent activity" card is informational only, so any
    // signed-in division account can see it, not just admin.
    if(canViewAdmin && typeof loadActivityLog === 'function') loadActivityLog();
  }

  function handleAuthState(user){
    var mySlug = user ? (DIVISION_ACCOUNTS[(user.email || '').toLowerCase()] || null) : null;
    var previousEmail = signedInEmail;
    signedInSlug = mySlug;
    signedInEmail = user ? user.email : null;
    applyAdminUI(mySlug === 'admin', !!mySlug);
    renderAuthWidget(user, mySlug);
    authStateListeners.forEach(function(fn){ fn(user, mySlug); });

    // Activity log: only real sign-in/sign-out transitions are logged,
    // not the very first onAuthStateChanged firing on page load (that's
    // Firebase silently restoring a persisted session, not a fresh
    // action taken by anyone).
    if(authInitialized && typeof logActivity === 'function'){
      if(user && !previousEmail){
        logActivity('Auth', 'Login', '', (mySlug ? DIVISION_NAMES[mySlug] : user.email) + ' (' + user.email + ') signed in.', user.email);
      } else if(!user && previousEmail){
        logActivity('Auth', 'Logout', '', previousEmail + ' signed out.', previousEmail);
      }
    }
    authInitialized = true;
  }

  if(fbAuth){
    fbAuth.onAuthStateChanged(handleAuthState);
  } else {
    handleAuthState(null);
  }
})();

/* =======================================================================
   Activity Log — powers the "Recent activity" card on the Administrative
   Services page (#sec-admin, targets #activityLogTimeline). Every module
   (Employees, Visitors, Calendar, News, Auth) calls the shared
   logActivity() helper in api.js right after a successful action; this
   section is only responsible for fetching what's been logged and
   rendering it here — it never writes to the log itself.
   ======================================================================= */
var activityLogs = [];

// Timestamps are supposed to always come back from the backend as
// "yyyy-MM-dd HH:mm:ss" in the script's own timezone (see
// Utilities.formatDate in ActivityLog.gs). But if a row's Timestamp cell
// is ever read before that formatting is applied — the same class of
// timezone/read-order quirk normalizeDateKey_() in calendar.js already
// guards against for "Event Date" — Sheets can hand back a raw Date
// (JSON.stringify'd into a full ISO string) or, in rarer cases, a bare
// epoch number. A freshly-saved row is the one most likely to hit this,
// since it's the one row that hasn't round-tripped through the sheet's
// existing formatting yet. This turns any of those shapes into a real
// millisecond value instead of dropping/misplacing the row.
function activityTimestampMs_(ts){
  if(ts === null || ts === undefined || ts === '') return 0;
  var m = String(ts).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if(m) return new Date(m[1], m[2]-1, m[3], m[4], m[5], m[6]).getTime();
  if(typeof ts === 'number' || /^\d+$/.test(String(ts).trim())) return Number(ts);
  var parsed = Date.parse(ts);
  return isNaN(parsed) ? 0 : parsed;
}

// Timestamps come back from the backend as "yyyy-MM-dd HH:mm:ss" in the
// script's own timezone (see Utilities.formatDate in ActivityLog.gs), so
// this parses it as local wall-clock time, not UTC.
function activityRelativeTime(ts){
  if(!ts) return '';
  var m = String(ts).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if(!m) return escapeHtml(String(ts));
  var then = new Date(m[1], m[2]-1, m[3], m[4], m[5], m[6]);
  var diffMs = Date.now() - then.getTime();
  var mins = Math.round(diffMs / 60000);
  if(mins < 1) return 'Just now';
  if(mins < 60) return mins + (mins === 1 ? ' minute ago' : ' minutes ago');
  var hrs = Math.round(mins / 60);
  if(hrs < 24) return hrs + (hrs === 1 ? ' hour ago' : ' hours ago');
  var days = Math.round(hrs / 24);
  if(days < 7) return days + (days === 1 ? ' day ago' : ' days ago');
  return then.toLocaleDateString(undefined, {month:'short', day:'numeric', year:'numeric'});
}

// Renders one .timeline-item exactly like the static markup this
// replaces (see index.html) — h5 gets the description, span gets
// "actor · relative time".
function activityItemHtml(log){
  var message = log.Message || ((log.Action || 'Activity') + ' — ' + (log.Module || 'System') + (log.RecordID ? ' (' + log.RecordID + ')' : ''));
  var who = log.User || 'System';
  return '<div class="timeline-item"><h5>' + escapeHtml(message) + '</h5><span>' + escapeHtml(who) + ' · ' + activityRelativeTime(log.Timestamp) + '</span></div>';
}

function renderActivityLog(){
  var container = document.getElementById('activityLogTimeline');
  if(!container) return;
  if(!activityLogs.length){
    container.innerHTML = '<p style="font-size:12.5px; color:var(--ink-soft); margin:0;">No activity recorded yet.</p>';
    return;
  }
  container.innerHTML = activityLogs.slice(0, 10).map(activityItemHtml).join('');
}

async function loadActivityLog(){
  try {
    const result = await getActivityLogs();
    if(!result.success){
      console.error(result.message);
      return;
    }
    // The backend already returns newest-first; sort again defensively
    // in case Sheets ever hands a row's Timestamp back as a raw Date
    // instead of the "yyyy-MM-dd HH:mm:ss" string it was written as.
    // Compares actual time values (via activityTimestampMs_) rather than
    // raw strings — a plain string compare silently sorts a differently-
    // shaped Timestamp (e.g. an unformatted epoch/ISO value) to the
    // bottom of the list, past the slice(0,10) below, which is exactly
    // how a just-saved row can end up "saved but not showing."
    activityLogs = (result.data || []).slice().sort(function(a, b){
      return activityTimestampMs_(b.Timestamp) - activityTimestampMs_(a.Timestamp);
    });
    renderActivityLog();
  } catch (err) {
    console.error('Failed to load activity log:', err);
  }
}

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
  '1st District': ['Anao','Camiling','Mayantoc','Moncada','Paniqui','Pura','Ramos','San Clemente','San Manuel','Santa Ignacia'],
  '2nd District': ['Tarlac City','Gerona','San Jose','Victoria'],
  '3rd District': ['Bamban','Capas','Concepcion','La Paz']
};
var html='';
for(var d in districts){
  html += '<div class="district-block"><h4>'+d+'</h4><div class="muni-chip-grid">';
  districts[d].forEach(function(m){ html += '<a class="muni-chip" href="#">'+m+'</a>'; });
  html += '</div></div>';
}
document.getElementById('muniLists').innerHTML = html;

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

/* ---------------- Charts ---------------- */
Chart.defaults.font.family = "'Inter',sans-serif";
Chart.defaults.color = '#4B5A53';

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

/* Citizen's Charter: Download PDF button */
(function(){
  var btn = document.getElementById('btnDownloadCharter');
  if(btn) btn.addEventListener('click', function(){
    alert('Preparing Citizen\'s Charter PDF for download…\n(This is a UI/UX concept — no real file is attached.)');
  });
})();

/* Reports: Export CSV button */
(function(){
  var btn = document.getElementById('btnExportCSV');
  if(btn) btn.addEventListener('click', function(){
    alert('Exporting report data as CSV…\n(This is a UI/UX concept — no real file is attached.)');
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

    var hitInNews = newsData.some(n => normalize(n.title).indexOf(q) !== -1 || normalize(n.body).indexOf(q) !== -1);

    if(hitInNews){
      go('news', document.querySelector('[data-target="news"]'));
    } else {
      alert('No results found for "' + topbarSearchInput.value + '".');
    }
  });
}

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

  // Read-only Google Sheets API v4 key (restricted, in Cloud Console, to
  // just the Sheets API + this site's domain). Used only for GET requests:
  // listing a spreadsheet's tabs and reading their values. It cannot write
  // to the sheet under any circumstance — an API key with no OAuth token
  // simply has no access to any endpoint that isn't a plain GET.
  var GOOGLE_SHEETS_API_KEY = 'AIzaSyCWGCGYuKie1UkP4_Ey09tD07JJvuDV65w';

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

  // ---- Shared, outer-scope copies of the column/number helpers used below
  // by the "Main dashboard overview stats" module. (createWidget keeps its
  // own copies further down for the per-division widgets — duplicated on
  // purpose so neither piece of code depends on the other's internals.)
  function ovFindColIdx(cols, keywords){
    for(var i=0;i<cols.length;i++){
      var c = cols[i].toLowerCase();
      for(var k=0;k<keywords.length;k++){
        if(c.indexOf(keywords[k]) !== -1) return i;
      }
    }
    return -1;
  }
  function ovToNumber(v){
    if(typeof v === 'number') return v;
    if(v == null || v === '') return 0;
    var n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
    return isNaN(n) ? 0 : n;
  }
  function ovFormatPeso(n){
    return '\u20B1' + n.toLocaleString('en-PH', {minimumFractionDigits:2, maximumFractionDigits:2});
  }

  // Keyword sets used to classify a status-column cell as "active/ongoing"
  // vs. "needs attention", regardless of exactly how each division phrases
  // it in their own sheet.
  var OV_ACTIVE_PATTERNS = ['ongoing','active','in progress','on-going','on going','on track','implementing'];
  var OV_ATTENTION_PATTERNS = ['delayed','flagged','on hold','on-hold','for review','at risk','needs attention','overdue','stalled','not started','behind'];

  function ovMatchesAny(text, patterns){
    text = String(text || '').toLowerCase();
    for(var i=0;i<patterns.length;i++){ if(text.indexOf(patterns[i]) !== -1) return true; }
    return false;
  }

  // Summarizes one division's merged sheet table for the main dashboard's
  // overview cards. Returns null contributions where a signal (status
  // column, budget columns) simply isn't present in that division's sheet,
  // rather than guessing.
  function summarizeDivisionTable(data){
    var cols = data.cols, rows = data.rows;
    var summary = {activeCount:0, attentionCount:0, hasStatus:false, allocatedSum:0, hasBudget:false};

    var statusIdx = ovFindColIdx(cols, ['status']);
    if(statusIdx >= 0){
      summary.hasStatus = true;
      rows.forEach(function(r){
        var v = r[statusIdx];
        if(ovMatchesAny(v, OV_ACTIVE_PATTERNS)) summary.activeCount++;
        else if(ovMatchesAny(v, OV_ATTENTION_PATTERNS)) summary.attentionCount++;
      });
    }

    var allocIdx = ovFindColIdx(cols, ['alloc']);
    if(allocIdx < 0) allocIdx = ovFindColIdx(cols, ['budget','amount']);
    if(allocIdx >= 0){
      summary.hasBudget = true;
      rows.forEach(function(r){ summary.allocatedSum += ovToNumber(r[allocIdx]); });
    }
    return summary;
  }

  // Drops trailing blank rows and trailing "Total/Grand Total/Subtotal" rows
  // from a single tab's data, so merging several monthly/quarterly tabs
  // together doesn't double-count each tab's own summary row.
  function stripTrailingSummaryRows(rows){
    var end = rows.length;
    while(end > 0){
      var r = rows[end - 1];
      var allBlank = r.every(function(c){ return c === null || c === undefined || String(c).trim() === ''; });
      var firstText = String(r[0] != null ? r[0] : '').trim().toLowerCase();
      var looksLikeTotal = /^(grand total|sub-?total|totals?)\b/.test(firstText);
      if(allBlank || looksLikeTotal){ end--; } else { break; }
    }
    return rows.slice(0, end);
  }

  // Fetches one or more tabs from the same spreadsheet (cfg.sheetTabs, a list
  // of tab names) one at a time through the shared JSONP queue, and merges
  // them into a single {cols, rows} table using the first tab's headers.
  // This is the fallback path used when auto-discovery is off (or fails).
  function loadAllTabsManual(cfg){
    var tabNames = (cfg.sheetTabs && cfg.sheetTabs.length) ? cfg.sheetTabs : [cfg.sheetName || ''];
    var merged = {cols: null, rows: []};
    var chain = Promise.resolve();
    tabNames.forEach(function(tabName){
      chain = chain.then(function(){
        var tabCfg = {sheetId: cfg.sheetId, sheetName: tabName, gid: tabName ? null : cfg.gid};
        return queuedLoadGviz(tabCfg).then(function(json){
          var t = extractTable(json);
          if(!merged.cols) merged.cols = t.cols;
          merged.rows = merged.rows.concat(stripTrailingSummaryRows(t.rows));
        });
      });
    });
    return chain.then(function(){ return merged; });
  }

  // Turns a raw value from the Sheets API v4 (always a string, or a number
  // when valueRenderOption=UNFORMATTED_VALUE) into the same shape the gviz
  // path produces: real numbers for numeric cells, plain strings otherwise.
  // Needed so isNumericColumn()/toNumber() behave identically no matter
  // which fetch path supplied the data.
  function coerceCell(v){
    if(v === undefined || v === null) return '';
    if(typeof v === 'number') return v;
    var s = String(v).trim();
    if(s === '') return '';
    // Only treat as a number if the whole trimmed string is numeric —
    // avoids mangling things like phone numbers, dates, or "12 Main St".
    if(/^-?\d+(\.\d+)?$/.test(s)) return parseFloat(s);
    return v;
  }

  // Quotes a tab name for use in an A1-notation range if it contains
  // spaces or special characters (Sheets API requires 'Tab Name'!A:Z).
  function quoteTabName(tabName){
    return "'" + String(tabName).replace(/'/g, "''") + "'";
  }

  // Lists every tab in a spreadsheet via the Sheets API v4 metadata
  // endpoint (a plain GET with the read-only API key — no OAuth, no
  // write access possible).
  function listSpreadsheetTabs(sheetId){
    var url = 'https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent(sheetId)
      + '?key=' + GOOGLE_SHEETS_API_KEY + '&fields=' + encodeURIComponent('sheets.properties.title');
    return fetch(url).then(function(resp){
      if(!resp.ok){
        return resp.json().catch(function(){ return null; }).then(function(body){
          var msg = (body && body.error && body.error.message) || ('HTTP ' + resp.status);
          throw new Error('Could not list tabs (' + msg + '). Check the API key restrictions and that the sheet is shared as "Anyone with the link".');
        });
      }
      return resp.json();
    }).then(function(json){
      return (json.sheets || []).map(function(s){ return s.properties.title; });
    });
  }

  // Fetches one tab's full values via the Sheets API v4 values endpoint.
  function fetchTabValuesApi(sheetId, tabName){
    var range = quoteTabName(tabName);
    var url = 'https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent(sheetId)
      + '/values/' + encodeURIComponent(range)
      + '?key=' + GOOGLE_SHEETS_API_KEY + '&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING';
    return fetch(url).then(function(resp){
      if(!resp.ok){
        return resp.json().catch(function(){ return null; }).then(function(body){
          var msg = (body && body.error && body.error.message) || ('HTTP ' + resp.status);
          throw new Error('Could not read tab "' + tabName + '" (' + msg + ').');
        });
      }
      return resp.json();
    }).then(function(json){
      var values = json.values || [];
      if(!values.length) return {cols: [], rows: []};
      var cols = values[0].map(function(c, i){ return (c === undefined || c === null || c === '') ? ('Column ' + (i+1)) : String(c); });
      var rows = values.slice(1).map(function(r){
        var row = [];
        for(var i=0;i<cols.length;i++){ row.push(coerceCell(r[i])); }
        return row;
      });
      return {cols: cols, rows: rows};
    });
  }

  // Auto-discovery path: lists every tab in the spreadsheet, fetches each
  // one's values (in parallel — real CORS-backed fetch(), no JSONP queue
  // needed), strips each tab's trailing summary row, and merges them all
  // into one table using the first tab's headers as the canonical set.
  function loadAllTabsAuto(cfg){
    return listSpreadsheetTabs(cfg.sheetId).then(function(tabNames){
      if(!tabNames.length) throw new Error('That spreadsheet has no tabs, or the API key can\'t see it.');
      return Promise.all(tabNames.map(function(tabName){
        return fetchTabValuesApi(cfg.sheetId, tabName);
      })).then(function(tables){
        var merged = {cols: null, rows: []};
        tables.forEach(function(t){
          if(!t.rows.length) return;
          if(!merged.cols) merged.cols = t.cols;
          merged.rows = merged.rows.concat(stripTrailingSummaryRows(t.rows));
        });
        if(!merged.cols) merged.cols = tables[0] ? tables[0].cols : [];
        return merged;
      });
    });
  }

  // Top-level loader used by every widget. Prefers automatic tab discovery
  // (cfg.autoDiscover, the default for newly-connected sheets) and falls
  // back to the manual comma-separated tab list over JSONP if auto mode
  // is off or the API call fails for any reason (e.g. key not yet active).
  function loadAllTabs(cfg){
    if(cfg.autoDiscover){
      return loadAllTabsAuto(cfg).catch(function(err){
        if(cfg.sheetTabs && cfg.sheetTabs.length){
          return loadAllTabsManual(cfg); // silent fallback if a manual list was also saved
        }
        throw err;
      });
    }
    return loadAllTabsManual(cfg);
  }


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

    // Loosely matches a column header against a list of keywords (case-insensitive
    // substring match), used to detect budget-style sheets (Plan/Funding Source,
    // Allocated, Obligated, Utilized, Provincial Office) regardless of exact wording.
    function findColIdx(cols, keywords){
      for(var i=0;i<cols.length;i++){
        var c = cols[i].toLowerCase();
        for(var k=0;k<keywords.length;k++){
          if(c.indexOf(keywords[k]) !== -1) return i;
        }
      }
      return -1;
    }

    function toNumber(v){
      if(typeof v === 'number') return v;
      if(v == null || v === '') return 0;
      var n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
      return isNaN(n) ? 0 : n;
    }

    // Shared column-sort comparator for sheet-data tables: numeric cells
    // compare numerically, everything else compares as case-insensitive text.
    function compareCell(a, b){
      var av = (a === null || a === undefined) ? '' : a;
      var bv = (b === null || b === undefined) ? '' : b;
      if(typeof av === 'number' && typeof bv === 'number') return av - bv;
      var as = String(av).toLowerCase(), bs = String(bv).toLowerCase();
      if(as < bs) return -1;
      if(as > bs) return 1;
      return 0;
    }

    function formatPeso(n, compact){
      if(compact){
        var abs = Math.abs(n);
        if(abs >= 1e6) return '\u20B1' + (n/1e6).toFixed(1) + 'M';
        if(abs >= 1e3) return '\u20B1' + (n/1e3).toFixed(1) + 'K';
        return '\u20B1' + n.toFixed(0);
      }
      return '\u20B1' + n.toLocaleString('en-PH', {minimumFractionDigits:2, maximumFractionDigits:2});
    }

    // Renders the richer "budget dashboard" layout — a grouped bar chart
    // comparing Allocated/Obligated/Utilized per plan, a pie chart of
    // allocation share, and a searchable detailed table — for sheets that
    // actually contain budget figures (as opposed to plain logs/records).
    function renderBudgetDashboard(data, colIdx){
      var cols = data.cols, rows = data.rows;
      var planIdx = colIdx.planIdx, officeIdx = colIdx.officeIdx,
          allocIdx = colIdx.allocIdx, obligIdx = colIdx.obligIdx, utilIdx = colIdx.utilIdx;

      var order = [];
      var groups = {};
      rows.forEach(function(r){
        var key = String(r[planIdx] != null && r[planIdx] !== '' ? r[planIdx] : '(Unspecified)');
        if(!groups[key]){ groups[key] = {allocated:0, obligated:0, utilized:0}; order.push(key); }
        groups[key].allocated += toNumber(r[allocIdx]);
        if(obligIdx >= 0) groups[key].obligated += toNumber(r[obligIdx]);
        if(utilIdx >= 0) groups[key].utilized += toNumber(r[utilIdx]);
      });
      var totalAllocated = order.reduce(function(s,k){ return s + groups[k].allocated; }, 0);

      var barId = 'divBudgetBar-' + slug, pieId = 'divBudgetPie-' + slug,
          searchId = 'divBudgetSearch-' + slug, tbodyId = 'divBudgetTbody-' + slug;
      var colCount = 2 + (officeIdx>=0?1:0) + (obligIdx>=0?1:0) + (utilIdx>=0?1:0);

      // Column definitions drive both the header row and each data row, so
      // sorting can look up the right cell index and numeric columns can be
      // right-aligned the way app-main's DataTable does.
      var tableCols = [{label:'Plan/Funding Source', idx:planIdx, numeric:false}];
      if(officeIdx>=0) tableCols.push({label:'Provincial Office', idx:officeIdx, numeric:false});
      tableCols.push({label:'Allocated', idx:allocIdx, numeric:true});
      if(obligIdx>=0) tableCols.push({label:'Obligated', idx:obligIdx, numeric:true});
      if(utilIdx>=0) tableCols.push({label:'Utilized', idx:utilIdx, numeric:true});

      var html = '<div style="display:flex; gap:16px; flex-wrap:wrap; margin-bottom:16px;">'
        + '<div class="card" style="flex:1 1 420px;"><h3>Budget Comparison by Plan</h3><div class="chart-box"><canvas id="'+barId+'"></canvas></div></div>'
        + '<div class="card" style="flex:1 1 320px;"><h3>Allocation Distribution</h3><div class="chart-box"><canvas id="'+pieId+'"></canvas></div></div>'
        + '</div>';

      html += '<div class="card"><h3 style="margin-bottom:10px;">Detailed Budget Data</h3>'
        + '<input type="text" id="'+searchId+'" placeholder="Search by office or plan…" '
        + 'style="width:100%; padding:9px 12px; border:1px solid var(--line); border-radius:8px; margin-bottom:12px; font-size:13px; box-sizing:border-box;">'
        + '<div class="sheet-table-wrap"><table><thead><tr>'
        + tableCols.map(function(c, i){ return '<th class="sortable-th'+(c.numeric?' num':'')+'" data-idx="'+i+'">'+escapeHtml(c.label)+'<span class="sort-ind"></span></th>'; }).join('')
        + '</tr></thead><tbody id="'+tbodyId+'"></tbody></table></div>'
        + '<p class="table-footnote" id="'+tbodyId+'-footer"></p>'
        + '</div>';

      bodyEl.innerHTML = html;

      var sortIdx = -1, sortDir = 1;

      function renderRows(filterText){
        filterText = (filterText || '').toLowerCase();
        var filtered = !filterText ? rows.slice() : rows.filter(function(r){
          var plan = String(r[planIdx] || '').toLowerCase();
          var office = officeIdx>=0 ? String(r[officeIdx] || '').toLowerCase() : '';
          return plan.indexOf(filterText) !== -1 || office.indexOf(filterText) !== -1;
        });
        if(sortIdx >= 0){
          var col = tableCols[sortIdx];
          filtered.sort(function(a,b){
            var av = col.numeric ? toNumber(a[col.idx]) : a[col.idx];
            var bv = col.numeric ? toNumber(b[col.idx]) : b[col.idx];
            return compareCell(av, bv) * sortDir;
          });
        }
        var tbody = document.getElementById(tbodyId);
        if(!tbody) return;
        tbody.innerHTML = filtered.length ? filtered.slice(0, 200).map(function(r){
          return '<tr>' + tableCols.map(function(c){
            if(c.numeric) return '<td class="num">'+formatPeso(toNumber(r[c.idx]))+'</td>';
            var s = escapeHtml(r[c.idx]);
            return '<td title="'+s+'">'+s+'</td>';
          }).join('') + '</tr>';
        }).join('') : '<tr><td colspan="'+colCount+'" style="text-align:center; color:var(--ink-soft); padding:20px;">No matching rows.</td></tr>';
        var footer = document.getElementById(tbodyId+'-footer');
        if(footer) footer.textContent = 'Showing ' + Math.min(filtered.length, 200) + ' of ' + filtered.length + ' rows' + (filtered.length !== rows.length ? ' (filtered from ' + rows.length + ')' : '') + '.';
      }
      renderRows('');
      var searchInput = document.getElementById(searchId);
      if(searchInput) searchInput.addEventListener('input', function(){ renderRows(this.value); });

      Array.prototype.forEach.call(bodyEl.querySelectorAll('.sortable-th'), function(th){
        th.addEventListener('click', function(){
          var idx = parseInt(th.getAttribute('data-idx'), 10);
          if(sortIdx === idx){ sortDir = -sortDir; } else { sortIdx = idx; sortDir = 1; }
          Array.prototype.forEach.call(bodyEl.querySelectorAll('.sortable-th .sort-ind'), function(ind){ ind.textContent = ''; });
          th.querySelector('.sort-ind').textContent = sortDir === 1 ? ' \u2191' : ' \u2193';
          renderRows(searchInput ? searchInput.value : '');
        });
      });

      var barColors = {allocated:'#2F5FDE', obligated:'#E08A2E', utilized:'#1E8F5B'};
      var datasets = [{label:'Allocated', data: order.map(function(k){return groups[k].allocated;}), backgroundColor: barColors.allocated, borderRadius:4}];
      if(obligIdx>=0) datasets.push({label:'Obligated', data: order.map(function(k){return groups[k].obligated;}), backgroundColor: barColors.obligated, borderRadius:4});
      if(utilIdx>=0) datasets.push({label:'Utilized', data: order.map(function(k){return groups[k].utilized;}), backgroundColor: barColors.utilized, borderRadius:4});

      new Chart(document.getElementById(barId), {
        type:'bar',
        data:{labels: order, datasets: datasets},
        options:{
          responsive:true, maintainAspectRatio:false,
          plugins:{
            legend:{position:'bottom', labels:{boxWidth:10}},
            tooltip:{callbacks:{label:function(ctx){ return ctx.dataset.label + ': ' + formatPeso(ctx.parsed.y); }}}
          },
          scales:{
            y:{beginAtZero:true, grid:{color:'#EEF3F0'}, ticks:{callback:function(v){ return formatPeso(v, true); }}},
            x:{grid:{display:false}}
          }
        }
      });

      var piePalette = ['#2F5FDE','#0E4A2B','#1E8F5B','#0E7F63','#3E7FE0','#E08A2E','#7A3FC4','#B3352A','#249456','#8A5A1E','#C8971E','#5A8FE0','#B36BD1','#4CA37A'];
      new Chart(document.getElementById(pieId), {
        type:'pie',
        data:{
          labels: order.map(function(k){
            var pct = totalAllocated>0 ? Math.round(groups[k].allocated/totalAllocated*100) : 0;
            return k + ': ' + pct + '%';
          }),
          datasets:[{
            data: order.map(function(k){return groups[k].allocated;}),
            backgroundColor: order.map(function(k,i){return piePalette[i % piePalette.length];}),
            borderColor:'#fff', borderWidth:2
          }]
        },
        options:{
          responsive:true, maintainAspectRatio:false,
          plugins:{
            legend:{position:'right', labels:{boxWidth:10, font:{size:11}}},
            tooltip:{callbacks:{label:function(ctx){ return ctx.label.split(':')[0] + ': ' + formatPeso(ctx.parsed); }}}
          }
        }
      });
    }

    // Renders a dashboard for log/correspondence-tracker style sheets —
    // e.g. DATE RECEIVED, FROM, TITLE, ACTION REQUIRED/TAKEN, DIVISION,
    // STATUS — using counts instead of currency: a bar chart of entries per
    // division (received vs. acted on), a pie chart of status breakdown,
    // and a searchable table of every row/column.
    function renderLogDashboard(data, colIdx){
      var cols = data.cols, rows = data.rows;
      var divisionIdx = colIdx.divisionIdx, statusIdx = colIdx.statusIdx, actionTakenIdx = colIdx.actionTakenIdx;

      function isFilled(v){ return v != null && String(v).trim() !== ''; }

      var barOrder = [], barGroups = {};
      if(divisionIdx >= 0){
        rows.forEach(function(r){
          var key = String(isFilled(r[divisionIdx]) ? r[divisionIdx] : '(Unspecified)');
          if(!barGroups[key]){ barGroups[key] = {received:0, actionTaken:0}; barOrder.push(key); }
          barGroups[key].received++;
          if(actionTakenIdx >= 0 && isFilled(r[actionTakenIdx])) barGroups[key].actionTaken++;
        });
      }

      var pieOrder = [], pieCounts = {};
      if(statusIdx >= 0){
        rows.forEach(function(r){
          var key = String(isFilled(r[statusIdx]) ? r[statusIdx] : '(No status)');
          if(pieCounts[key] === undefined){ pieCounts[key] = 0; pieOrder.push(key); }
          pieCounts[key]++;
        });
      }
      var totalRows = rows.length;

      var barId = 'divLogBar-' + slug, pieId = 'divLogPie-' + slug,
          searchId = 'divLogSearch-' + slug, tbodyId = 'divLogTbody-' + slug;

      var html = '';
      if(barOrder.length || pieOrder.length){
        html += '<div style="display:flex; gap:16px; flex-wrap:wrap; margin-bottom:16px;">';
        if(barOrder.length){
          html += '<div class="card" style="flex:1 1 420px;"><h3>Entries by Division</h3><div class="chart-box"><canvas id="'+barId+'"></canvas></div></div>';
        }
        if(pieOrder.length){
          html += '<div class="card" style="flex:1 1 320px;"><h3>Status Distribution</h3><div class="chart-box"><canvas id="'+pieId+'"></canvas></div></div>';
        }
        html += '</div>';
      }

      html += '<div class="card"><h3 style="margin-bottom:10px;">Sheet data (' + rows.length + ' rows)</h3>'
        + '<input type="text" id="'+searchId+'" placeholder="Search by title, sender, division, or status…" '
        + 'style="width:100%; padding:9px 12px; border:1px solid var(--line); border-radius:8px; margin-bottom:12px; font-size:13px; box-sizing:border-box;">'
        + '<div class="sheet-table-wrap"><table><thead><tr>'
        + cols.map(function(c, i){ return '<th class="sortable-th" data-idx="'+i+'">'+escapeHtml(c)+'<span class="sort-ind"></span></th>'; }).join('')
        + '</tr></thead><tbody id="'+tbodyId+'"></tbody></table></div>'
        + '<p class="table-footnote" id="'+tbodyId+'-footer"></p>'
        + '</div>';

      bodyEl.innerHTML = html;

      var sortIdx = -1, sortDir = 1;

      function renderRows(filterText){
        filterText = (filterText || '').toLowerCase();
        var filtered = !filterText ? rows.slice() : rows.filter(function(r){
          return r.some(function(v){ return String(v == null ? '' : v).toLowerCase().indexOf(filterText) !== -1; });
        });
        if(sortIdx >= 0){
          filtered.sort(function(a,b){ return compareCell(a[sortIdx], b[sortIdx]) * sortDir; });
        }
        var tbody = document.getElementById(tbodyId);
        if(!tbody) return;
        tbody.innerHTML = filtered.length ? filtered.slice(0, 200).map(function(r){
          return '<tr>' + r.map(function(v){ var s = escapeHtml(v===null||v===undefined?'':v); return '<td title="'+s+'">'+s+'</td>'; }).join('') + '</tr>';
        }).join('') : '<tr><td colspan="'+cols.length+'" style="text-align:center; color:var(--ink-soft); padding:20px;">No matching rows.</td></tr>';
        var footer = document.getElementById(tbodyId+'-footer');
        if(footer) footer.textContent = 'Showing ' + Math.min(filtered.length, 200) + ' of ' + filtered.length + ' rows' + (filtered.length !== rows.length ? ' (filtered from ' + rows.length + ')' : '') + '.';
      }
      renderRows('');
      var searchInput = document.getElementById(searchId);
      if(searchInput) searchInput.addEventListener('input', function(){ renderRows(this.value); });

      Array.prototype.forEach.call(bodyEl.querySelectorAll('.sortable-th'), function(th){
        th.addEventListener('click', function(){
          var idx = parseInt(th.getAttribute('data-idx'), 10);
          if(sortIdx === idx){ sortDir = -sortDir; } else { sortIdx = idx; sortDir = 1; }
          Array.prototype.forEach.call(bodyEl.querySelectorAll('.sortable-th .sort-ind'), function(ind){ ind.textContent = ''; });
          th.querySelector('.sort-ind').textContent = sortDir === 1 ? ' \u2191' : ' \u2193';
          renderRows(searchInput ? searchInput.value : '');
        });
      });

      if(barOrder.length){
        new Chart(document.getElementById(barId), {
          type:'bar',
          data:{
            labels: barOrder,
            datasets: [
              {label:'Received', data: barOrder.map(function(k){return barGroups[k].received;}), backgroundColor:'#2F5FDE', borderRadius:4},
            ].concat(actionTakenIdx>=0 ? [{label:'Action taken', data: barOrder.map(function(k){return barGroups[k].actionTaken;}), backgroundColor:'#1E8F5B', borderRadius:4}] : [])
          },
          options:{
            responsive:true, maintainAspectRatio:false,
            plugins:{legend:{position:'bottom', labels:{boxWidth:10}}},
            scales:{y:{beginAtZero:true, grid:{color:'#EEF3F0'}, ticks:{precision:0}}, x:{grid:{display:false}}}
          }
        });
      }

      if(pieOrder.length){
        var piePalette = ['#2F5FDE','#0E4A2B','#1E8F5B','#E08A2E','#7A3FC4','#B3352A','#249456','#8A5A1E','#C8971E','#5A8FE0'];
        new Chart(document.getElementById(pieId), {
          type:'pie',
          data:{
            labels: pieOrder.map(function(k){
              var pct = totalRows>0 ? Math.round(pieCounts[k]/totalRows*100) : 0;
              return k + ': ' + pct + '%';
            }),
            datasets:[{
              data: pieOrder.map(function(k){return pieCounts[k];}),
              backgroundColor: pieOrder.map(function(k,i){return piePalette[i % piePalette.length];}),
              borderColor:'#fff', borderWidth:2
            }]
          },
          options:{
            responsive:true, maintainAspectRatio:false,
            plugins:{legend:{position:'right', labels:{boxWidth:10, font:{size:11}}}}
          }
        });
      }
    }

    function renderTableAndChart(data){
      var cols = data.cols, rows = data.rows;

      // Budget-style sheets (Plan/Funding Source + Allocated + Obligated/Utilized)
      // get the richer bar+pie+searchable-table dashboard; everything else
      // (logs, correspondence trackers, etc.) falls back to the plain table.
      var planIdx = findColIdx(cols, ['plan', 'funding source']);
      var allocIdx = findColIdx(cols, ['alloc']);
      var obligIdx = findColIdx(cols, ['obligat']);
      var utilIdx = findColIdx(cols, ['util']);
      var officeIdx = findColIdx(cols, ['provincial office', 'office', 'division']);
      if(planIdx >= 0 && allocIdx >= 0 && (obligIdx >= 0 || utilIdx >= 0)){
        renderBudgetDashboard(data, {planIdx:planIdx, officeIdx:officeIdx, allocIdx:allocIdx, obligIdx:obligIdx, utilIdx:utilIdx});
        return;
      }

      // Log/correspondence-tracker sheets (Division and/or Status columns,
      // no budget figures) get the count-based dashboard instead.
      var divisionIdx = findColIdx(cols, ['division']);
      var statusIdx = findColIdx(cols, ['status']);
      var actionTakenIdx = findColIdx(cols, ['action taken']);
      if(divisionIdx >= 0 || statusIdx >= 0){
        renderLogDashboard(data, {divisionIdx:divisionIdx, statusIdx:statusIdx, actionTakenIdx:actionTakenIdx});
        return;
      }

      var numericIdx = [];
      var labelIdx = 0;
      for(var i=0;i<cols.length;i++){
        if(isNumericColumn(rows, i)) numericIdx.push(i);
      }
      for(var j=0;j<cols.length;j++){
        if(numericIdx.indexOf(j) === -1){ labelIdx = j; break; }
      }
      var chartId = 'divChartCanvas-' + slug;
      var searchId = 'divGenSearch-' + slug, tbodyId = 'divGenTbody-' + slug;
      var html = '';
      if(numericIdx.length){
        html += '<div class="card" style="margin-bottom:16px;"><h3>' + escapeHtml(name) + ' — at a glance</h3>'
          + '<div class="chart-box"><canvas id="'+chartId+'"></canvas></div></div>';
      }
      html += '<div class="card"><h3 style="margin-bottom:10px;">Sheet data (' + rows.length + ' rows)</h3>'
        + '<input type="text" id="'+searchId+'" placeholder="Search…" '
        + 'style="width:100%; padding:9px 12px; border:1px solid var(--line); border-radius:8px; margin-bottom:12px; font-size:13px; box-sizing:border-box;">'
        + '<div class="sheet-table-wrap">'
        + '<table><thead><tr>' + cols.map(function(c, i){ return '<th class="sortable-th" data-idx="'+i+'">'+escapeHtml(c)+'<span class="sort-ind"></span></th>'; }).join('') + '</tr></thead>'
        + '<tbody id="'+tbodyId+'"></tbody></table>'
        + '</div>'
        + '<p class="table-footnote" id="'+tbodyId+'-footer"></p>'
        + '</div>';
      bodyEl.innerHTML = html;

      var sortIdx = -1, sortDir = 1;
      function renderRows(filterText){
        filterText = (filterText || '').toLowerCase();
        var filtered = !filterText ? rows.slice() : rows.filter(function(r){
          return r.some(function(v){ return String(v == null ? '' : v).toLowerCase().indexOf(filterText) !== -1; });
        });
        if(sortIdx >= 0){
          filtered.sort(function(a,b){ return compareCell(a[sortIdx], b[sortIdx]) * sortDir; });
        }
        var tbody = document.getElementById(tbodyId);
        if(!tbody) return;
        tbody.innerHTML = filtered.length ? filtered.slice(0, 200).map(function(r){
          return '<tr>' + r.map(function(v){ var s = escapeHtml(v===null||v===undefined?'':v); return '<td title="'+s+'">'+s+'</td>'; }).join('') + '</tr>';
        }).join('') : '<tr><td colspan="'+cols.length+'" style="text-align:center; color:var(--ink-soft); padding:20px;">No matching rows.</td></tr>';
        var footer = document.getElementById(tbodyId+'-footer');
        if(footer) footer.textContent = 'Showing ' + Math.min(filtered.length, 200) + ' of ' + filtered.length + ' rows' + (filtered.length !== rows.length ? ' (filtered from ' + rows.length + ')' : '') + '.';
      }
      renderRows('');
      var searchInput = document.getElementById(searchId);
      if(searchInput) searchInput.addEventListener('input', function(){ renderRows(this.value); });
      Array.prototype.forEach.call(bodyEl.querySelectorAll('.sortable-th'), function(th){
        th.addEventListener('click', function(){
          var idx = parseInt(th.getAttribute('data-idx'), 10);
          if(sortIdx === idx){ sortDir = -sortDir; } else { sortIdx = idx; sortDir = 1; }
          Array.prototype.forEach.call(bodyEl.querySelectorAll('.sortable-th .sort-ind'), function(ind){ ind.textContent = ''; });
          th.querySelector('.sort-ind').textContent = sortDir === 1 ? ' \u2191' : ' \u2193';
          renderRows(searchInput ? searchInput.value : '');
        });
      });

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
        return loadAllTabs(cfg)
          .then(function(data){
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
        var tabsValue = (cfg.sheetTabs && cfg.sheetTabs.length) ? cfg.sheetTabs.join(', ') : (cfg.sheetName || '');
        var autoChecked = cfg.autoDiscover !== false; // default on for new connections
        var bodyHtml =
          '<div class="form-group"><label>Google Sheet link</label><input type="text" id="fDivSheetUrl" placeholder="https://docs.google.com/spreadsheets/d/…/edit" value="'+escapeHtml(cfg.rawUrl||'')+'"></div>'
          + '<div class="form-group" style="display:flex; align-items:flex-start; gap:8px;">'
          + '<input type="checkbox" id="fDivAutoTabs" style="margin-top:3px;"' + (autoChecked ? ' checked' : '') + '>'
          + '<label for="fDivAutoTabs" style="margin:0;">Automatically pull every tab (recommended) — new monthly/quarterly tabs show up on their own, no need to type names.</label>'
          + '</div>'
          + '<div class="form-group" id="fDivManualTabsGroup" style="display:'+(autoChecked?'none':'block')+';">'
          + '<label>Tab(s) / sheet name(s)</label><input type="text" id="fDivSheetName" placeholder="e.g. Jan, Feb, Mar — leave blank for the first tab" value="'+escapeHtml(tabsValue)+'"></div>'
          + '<div class="form-hint">In Google Sheets: File → Share → General access → "Anyone with the link" → Viewer. Then paste the link here.</div>'
          + '<div class="form-error" id="fDivSheetError">Couldn\'t find a valid sheet ID in that link.</div>';

        openModal('Connect ' + name + "'s Google Sheet", bodyHtml, function(){
          var url = document.getElementById('fDivSheetUrl').value.trim();
          var autoDiscover = document.getElementById('fDivAutoTabs').checked;
          var tabsInput = document.getElementById('fDivSheetName').value.trim();
          var tabList = tabsInput ? tabsInput.split(',').map(function(s){ return s.trim(); }).filter(Boolean) : [];
          var id = extractSheetId(url);
          if(!id){
            document.getElementById('fDivSheetError').classList.add('show');
            return false;
          }
          setConfig(slug, {sheetId:id, autoDiscover:autoDiscover, sheetTabs:tabList, sheetName: tabList[0] || '', rawUrl:url}).then(fetchAndRender);
        }, {saveLabel: cfg.sheetId ? 'Update' : 'Connect'});

        var autoCheckbox = document.getElementById('fDivAutoTabs');
        var manualGroup = document.getElementById('fDivManualTabsGroup');
        if(autoCheckbox && manualGroup){
          autoCheckbox.addEventListener('change', function(){
            manualGroup.style.display = this.checked ? 'none' : 'block';
          });
        }

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

  /* =====================================================================
     Main dashboard overview stats — reads the same Firestore-backed
     configs and the same live Google Sheets every division widget above
     already pulls from, and rolls them up into the 4 stat cards at the
     top of the dashboard. Nothing here is manually typed or editable:
     every number is derived at page-load time from whatever each
     division has actually connected.
       - "Active provincial projects"     -> rows across all divisions
                                              whose status column reads
                                              as ongoing/active.
       - "Projects needing attention"     -> rows across all divisions
                                              whose status column reads
                                              as delayed/flagged/at risk.
       - "Total PDIP allocation, CY 2026" -> sum of the allocation/budget
                                              column from the PDIP
                                              division's own sheet only.
       - "Documents published this month" -> handled separately, see
                                              refreshDocsPublishedStat()
                                              below (fed by news.js).
     ===================================================================== */
  function refreshOverviewStats(){
    var activeEl = document.getElementById('statActiveValue');
    if(!activeEl) return; // this build doesn't have the overview cards

    var activeTrendEl = document.getElementById('statActiveTrend');
    var attentionEl = document.getElementById('statAttentionValue');
    var attentionTrendEl = document.getElementById('statAttentionTrend');
    var pdipEl = document.getElementById('statPdipValue');
    var pdipTrendEl = document.getElementById('statPdipTrend');
    var noteEl = document.getElementById('statSourceNote');

    Promise.all(DIVISIONS.map(function(division){
      return getConfig(division.slug).then(function(cfg){
        if(!cfg) return {division: division, connected:false};
        return loadAllTabs(cfg)
          .then(function(data){ return {division: division, connected:true, summary: summarizeDivisionTable(data)}; })
          .catch(function(){ return {division: division, connected:true, summary:null}; }); // connected but unreachable right now
      });
    })).then(function(results){
      var activeTotal = 0, attentionTotal = 0, pdipAllocation = 0;
      var connectedCount = 0, statusReportingCount = 0, pdipConnected = false, pdipHasBudget = false;

      results.forEach(function(r){
        if(!r.connected) return;
        connectedCount++;
        if(!r.summary) return;
        if(r.summary.hasStatus){
          statusReportingCount++;
          activeTotal += r.summary.activeCount;
          attentionTotal += r.summary.attentionCount;
        }
        if(r.division.slug === 'pdip'){
          pdipConnected = true;
          if(r.summary.hasBudget){ pdipHasBudget = true; pdipAllocation += r.summary.allocatedSum; }
        }
      });

      activeEl.textContent = activeTotal.toLocaleString('en-PH');
      if(activeTrendEl) activeTrendEl.textContent = statusReportingCount + ' of ' + DIVISIONS.length + ' divisions reporting';

      attentionEl.textContent = attentionTotal.toLocaleString('en-PH');
      if(attentionTrendEl) attentionTrendEl.textContent = attentionTotal > 0 ? (attentionTotal + ' flagged') : 'None flagged';

      if(pdipEl) pdipEl.textContent = ovFormatPeso(pdipAllocation);
      if(pdipTrendEl) pdipTrendEl.textContent = !pdipConnected ? 'Not yet connected' : (pdipHasBudget ? 'Live from PDIP sheet' : 'No budget column found');

      if(noteEl){
        noteEl.textContent = connectedCount
          ? ('Live figures from ' + connectedCount + ' of ' + DIVISIONS.length + ' connected division sheets. Divisions without a connected sheet aren\u2019t counted yet.')
          : 'No division sheets are connected yet — figures will populate automatically as each division connects theirs.';
      }
    });
  }

  function refreshAll(){
    widgets.forEach(function(w){ w.fetchAndRender(); });
    refreshOverviewStats();
  }
  if(!widgets.length && !document.getElementById('statActiveValue')) return; // nothing on this page needs this module

  // Sign-in now happens once from the topbar (see the site-wide auth
  // controller above). Whenever that auth state changes — sign in, sign
  // out, switch accounts — just re-fetch/re-render every division widget
  // on this page so each one's "Connect sheet" button and read-only state
  // reflect who's signed in now (and re-roll-up the overview stats, since
  // a newly-connected sheet should show up in them too).
  onAuthStateReady(refreshAll);
  refreshAll();
})();

/* =======================================================================
   Documents published this month — the 4th overview card. Kept separate
   from the Firestore/Sheets rollup above because it's fed by the real
   News & Announcements feed (news.js), which loads asynchronously and
   after this file. news.js calls this function once its data is in.
   Declared as a plain top-level function so it's reachable from news.js
   regardless of load order edge cases.
   ======================================================================= */
function refreshDocsPublishedStat(){
  var valueEl = document.getElementById('statDocsValue');
  if(!valueEl) return;
  var trendEl = document.getElementById('statDocsTrend');

  var list = (typeof newsData !== 'undefined' && Array.isArray(newsData)) ? newsData : [];
  var now = new Date();
  var thisMonth = list.filter(function(n){
    var d = new Date(n.date);
    return !isNaN(d) && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  });

  valueEl.textContent = thisMonth.length.toLocaleString('en-PH');
  if(trendEl) trendEl.textContent = list.length + ' total published';
}