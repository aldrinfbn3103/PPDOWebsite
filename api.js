/* =======================================================================
   api.js — Global constants, shared utilities, generic modal system,
   and top-level navigation/sidebar wiring used by every other module.

   Load this file FIRST — every other script (dashboard.js, employees.js,
   calendar.js, visitors.js, news.js) calls functions defined
   here (escapeHtml, openModal/closeModal, go, normalize, pad2, dateKey,
   wireInlineEdit, nowLabel) at load time or in click handlers.
   ======================================================================= */

// ================================
// APPS SCRIPT WEB APP URLS
// ================================

// News & Announcements
const API_URL =
  "https://script.google.com/macros/s/AKfycbxDgCxlMthEiYR9WoFif_4p-jqFdfJsL6srJ3rbkEfSmdVZgTXMGkEaLsRSPOYymv1y/exec";

// Admin Portal
const ADMIN_API_URL =
  "https://script.google.com/macros/s/AKfycbyRZYHtu_--0bnnKuzLt0WajFWbSrdB0k86Kxl9V4H6pfoGebIiZa_EvqzDwVcFEE_1/exec";

// ================================
// GENERIC API REQUEST
// ================================

async function apiRequest(action, method = "GET", data = null, apiUrl = ADMIN_API_URL) {

    const isGet = method === "GET";

    // Cache-busting for reads: the Apps Script /exec URL is identical on
    // every call for a given action, so a plain fetch() can be served a
    // stale response straight from the browser's HTTP cache instead of
    // hitting the network. getActivityLogs is the read most exposed to
    // this — it's the one endpoint re-fetched after *every* create/
    // update/delete across the whole app (see logActivity() below) — so
    // a save immediately followed by a re-fetch of the same URL is
    // exactly the pattern that can return the pre-save snapshot. The
    // timestamped query param plus cache:'no-store' guarantee every read
    // actually goes to the network and gets the row that was just saved.
    const url = `${apiUrl}?action=${action}` + (isGet ? `&_=${Date.now()}` : "");

    const options = {
        method,
        cache: "no-store"
    };

    if (method === "POST") {

        options.headers = {
            "Content-Type": "text/plain;charset=utf-8"
        };

        options.body = JSON.stringify(data);

    }

    const response = await fetch(url, options);

    return response.json();

}

// ================================
// EMPLOYEES API
// ================================

async function getEmployees() {
    return apiRequest("getEmployees");
}

async function addEmployee(employee) {
    return apiRequest("addEmployee", "POST", employee);
}

// Sends the full edited employee record (must include employeeID) to
// the backend so the matching sheet row can be updated in place.
async function updateEmployee(employee) {
    return apiRequest("updateEmployee", "POST", employee);
}

// Soft-deletes an employee by ID (backend flips isActive to false;
// the row itself is never removed from the sheet).
async function deleteEmployee(employeeID) {
    return apiRequest("deleteEmployee", "POST", { employeeID: employeeID });
}

// Permanently deletes an employee's row from the sheet (backend removes
// the row entirely). Cannot be undone — the caller is responsible for
// confirming with the user first.
async function removeEmployeePermanently(employeeID) {
    return apiRequest("removeEmployee", "POST", { employeeID: employeeID });
}

// ================================
// VISITORS API
// ================================

async function getVisitors() {
    return apiRequest("getVisitors");
}

async function addVisitor(visitor) {
    return apiRequest("addVisitor", "POST", visitor);
}

// Sends the full edited visitor record (must include visitorID) to
// the backend so the matching sheet row can be updated in place.
async function updateVisitor(visitor) {
    return apiRequest("updateVisitor", "POST", visitor);
}

// Soft-deletes a visitor by ID (backend flips isActive to false;
// the row itself is never removed from the sheet).
async function deleteVisitor(visitorID) {
    return apiRequest("deleteVisitor", "POST", { visitorID: visitorID });
}

// Permanently deletes a visitor's row from the sheet (backend removes
// the row entirely). Cannot be undone — the caller is responsible for
// confirming with the user first.
async function removeVisitorPermanently(visitorID) {
    return apiRequest("removeVisitor", "POST", { visitorID: visitorID });
}

// ================================
// PROJECTS API
// ================================

async function getProjects() {
    return apiRequest("getProjects");
}

async function addProject(project) {
    return apiRequest("addProject", "POST", project);
}

// Sends the full edited project record (must include projectID) to
// the backend so the matching sheet row can be updated in place.
async function updateProject(project) {
    return apiRequest("updateProject", "POST", project);
}

// Soft-deletes a project by ID (backend flips isActive to false;
// the row itself is never removed from the sheet).
async function deleteProject(projectID) {
    return apiRequest("deleteProject", "POST", { projectID: projectID });
}

// Permanently deletes a project's row from the sheet (backend removes
// the row entirely). Cannot be undone — the caller is responsible for
// confirming with the user first.
async function removeProjectPermanently(projectID) {
    return apiRequest("removeProject", "POST", { projectID: projectID });
}

// ================================
// CALENDAR API
// ================================

async function getCalendar() {
    return apiRequest("getCalendar");
}

async function addEvent(event) {
    return apiRequest("addEvent", "POST", event);
}

// Sends the full edited event record (must include EventID) to
// the backend so the matching sheet row can be updated in place.
async function updateEvent(event) {
    return apiRequest("updateEvent", "POST", event);
}

// Soft-deletes an event by ID (backend flips isActive to false;
// the row itself is never removed from the sheet). Sent as "EventID"
// (capital) to match the Calendar sheet's actual column header.
async function deleteEvent(eventID) {
    return apiRequest("deleteEvent", "POST", { EventID: eventID });
}

// Permanently deletes an event's row from the sheet (backend removes
// the row entirely). Cannot be undone — the caller is responsible for
// confirming with the user first.
async function removeEventPermanently(eventID) {
    return apiRequest("removeEvent", "POST", { EventID: eventID });
}

// ================================
// ACTIVITY LOG API
// ================================
// Centralized logging: every module (Employees, Visitors, Calendar,
// News, Auth, ...) calls logActivity() right after a successful action
// instead of writing its own logging code. See the call sites in
// employees.js / calendar.js / visitors.js / news.js / dashboard.js.
//
// Two backend endpoints back this, both added to Api.gs / ActivityLog.gs:
//   - getActivityLogs : read, used to populate the "Recent activity"
//     card on the Administrative Services page (see dashboard.js).
//   - addActivityLog  : write, the single endpoint every logActivity()
//     call below goes through.

async function getActivityLogs() {
    return apiRequest("getActivityLogs");
}

// module   - "Employees" | "Visitors" | "Calendar" | "News" | "Auth" | ...
// action   - "Create" | "Update" | "Delete" | "Login" | "Logout" | ...
// recordId - the affected record's ID (employeeID, EventID, visitorID,
//            news id), or "" for actions with no single record (Login).
// message  - short, human-readable description of what happened, e.g.
//            'Updated employee Juan Dela Cruz — changed status: In
//            Office → On Leave.'
//
// The acting user defaults to the `signedInEmail` global that
// dashboard.js keeps in sync with Firebase auth state, so most callers
// never need to pass it in themselves. The optional 5th argument
// overrides that default — needed for Logout, where by the time the log
// call fires signedInEmail has already been cleared back to null.
//
// Fire-and-forget: a logging failure (network hiccup, etc.) is only
// reported to the console — it never surfaces to the user and never
// blocks or undoes the action that already succeeded.
//
// After a successful write, this also refreshes the "Recent activity"
// card itself (loadActivityLog() re-fetches + re-renders — see
// dashboard.js) so the new entry shows up immediately, without the
// user needing to reload the page or sign out/in again. loadActivityLog
// is guarded with a typeof check the same way dashboard.js already
// guards its own calls to logActivity/loadActivityLog, since api.js
// loads before dashboard.js defines it.
async function logActivity(module, action, recordId, message, actorEmail) {
    try {
        var user = actorEmail || (typeof signedInEmail !== 'undefined' && signedInEmail) || "System";
        var result = await apiRequest("addActivityLog", "POST", {
            user: user,
            module: module,
            action: action,
            recordId: recordId || "",
            message: message || ""
        });
        if (result && result.success && typeof loadActivityLog === 'function') {
            loadActivityLog();
        }
        return result;
    } catch (err) {
        console.error("Failed to record activity log:", err);
    }
}

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

function escapeHtml(str){
  return (str || '').toString().replace(/[&<>"']/g, function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}

function normalize(str){
  return (str || '').toString().toLowerCase().trim();
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

/* Shared "now" label used by employees.js (last-updated timestamps) and
   visitors.js (default visit date/time). */
function nowLabel(){
  var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var d = new Date();
  var dateStr = months[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
  var timeStr = d.toLocaleTimeString(undefined, {hour:'numeric', minute:'2-digit'});
  return dateStr + ' · ' + timeStr;
}