/* =======================================================================
   visitors.js — Visitor log: table of logged visitors, the Log/Edit
   Visitor modal, and soft/permanent delete.

   Mirrors the CRUD architecture used in employees.js exactly (data
   loading from the backend, a single Add/Edit modal, soft delete with a
   permanent-delete escape hatch) — Visitors simply replace Employees as
   the data model. The table is read-only outside the modal: the Edit
   button is the only way to change a visitor's information, there is no
   more inline contenteditable editing.

   Depends on api.js (escapeHtml, openModal/closeModal, nowLabel) and the
   getVisitors/addVisitor/updateVisitor/deleteVisitor/
   removeVisitorPermanently API functions defined there.
   ======================================================================= */

/* ---------------- Visitor log ---------------- */
var visitors = [];

function visitorRow(v){
  var actions = adminSignedIn
    ? '<button class="row-edit" data-vis-edit="'+v.id+'" title="Edit">✎</button><button class="row-remove" data-vis-remove="'+v.id+'" title="Remove">✕</button>'
    : '<span style="color:var(--ink-soft); font-size:11.5px;">View only</span>';
  return '<tr data-id="'+v.id+'">'
    + '<td>'+escapeHtml(v.name)+'</td>'
    + '<td>'+escapeHtml(v.org)+'</td>'
    + '<td>'+escapeHtml(v.purpose)+'</td>'
    + '<td style="font-size:12.5px; color:var(--ink-soft);">'+escapeHtml(v.datetime)+'</td>'
    + '<td>'+escapeHtml(v.host)+'</td>'
    + '<td>'+actions+'</td>'
    + '</tr>';
}

async function loadVisitors() {
  try {

    const result = await getVisitors();

    if (!result.success) {
      console.error(result.message);
      return;
    }

    visitors = result.data
    .filter(v => v.isActive === true || v.isActive === "TRUE")
    .map(v => {

        return {

            id: v.visitorID,

            name: v.name || "",

            org: v.organization || "",

            purpose: v.purpose || "",

            datetime: v.datetime || "",

            host: v.host || "",

            updated: v.updatedAt || ""

        };

    });

    renderVisitors();

  } catch (err) {

    console.error("Failed to load visitors:", err);

  }
}

function renderVisitors(){
  document.getElementById('visitorTable').innerHTML = visitors.length
    ? visitors.map(visitorRow).join('')
    : '<tr><td colspan="6" style="text-align:center; color:var(--ink-soft);">No visitors logged yet.</td></tr>';
  wireVisitorRows();
}

// The table is read-only: name, organization, purpose, date/time, and
// host are shown as plain text, not form controls. The Edit button
// (below) is the only way to change any of them.
function wireVisitorRows(){
  document.querySelectorAll('[data-vis-edit]').forEach(function(btn){
    btn.addEventListener('click', function(){
      var v = visitors.find(function(x){ return x.id === btn.dataset.visEdit; });
      if(!v){
        console.error('Edit failed: no visitor matched id', btn.dataset.visEdit);
        alert('Could not load this visitor — try refreshing the page.');
        return;
      }
      openVisitorForm(v);
    });
  });
  document.querySelectorAll('[data-vis-remove]').forEach(function(btn){
    btn.addEventListener('click', function(){
      var id = btn.dataset.visRemove;
      var v = visitors.find(function(x){ return x.id === id; });
      var rawName = v ? v.name : 'this visitor';
      var name = escapeHtml(rawName);

      openModal(
        'Delete Visitor',
        '<p>Are you sure you want to delete <strong>'+name+'</strong>?</p>'
          + '<p style="color:var(--ink-soft); font-size:12.5px;">This is a soft delete — the record stays in Google Sheets, it just stops appearing here.</p>'
          + '<p style="margin-top:14px;"><a href="#" id="lnkRemoveVisitorPermanent" style="color:var(--ink-soft); font-size:12.5px; text-decoration:underline;">Remove this record permanently instead</a></p>',
        async function(){
          const result = await deleteVisitor(id);
          if(!result.success){
            alert(result.message);
            return false;
          }
          logActivity('Visitors', 'Delete', id, 'Archived visitor log entry for ' + rawName + ' (soft delete).');
          await loadVisitors();
        },
        { saveLabel: 'Delete', saveClass: 'btn btn-danger' }
      );

      var lnk = document.getElementById('lnkRemoveVisitorPermanent');
      if(lnk){
        lnk.addEventListener('click', function(ev){
          ev.preventDefault();
          closeModal();
          openPermanentRemoveVisitorModal(id, name, rawName);
        });
      }
    });
  });
}

// Second, separate confirmation for the irreversible permanent delete.
// Kept as its own modal — reached via the link inside the soft-delete
// modal above — rather than a new row button, so the table layout stays
// exactly as it was.
function openPermanentRemoveVisitorModal(id, name, rawName){
  openModal(
    'Remove Visitor Permanently',
    '<p>Are you sure you want to permanently remove <strong>'+name+'</strong>?</p>'
      + '<p style="color:var(--ink-soft); font-size:12.5px;">This action cannot be undone.</p>',
    async function(){
      const result = await removeVisitorPermanently(id);
      if(!result.success){
        alert(result.message);
        return false;
      }
      logActivity('Visitors', 'Delete', id, 'Permanently removed visitor log entry for ' + (rawName || name) + '.');
      await loadVisitors();
    },
    { saveLabel: 'Remove Permanently', saveClass: 'btn btn-danger' }
  );
}

// Shared Add/Edit modal. Call with no arguments to log a new visitor, or
// pass an existing record (from the `visitors` array) to edit it in
// place. Visitor ID and Logged date are never user-editable: the
// backend generates the ID (so the Add form has no ID field at all),
// and on Edit it's shown disabled, for reference only. createdAt has no
// field at all — it's preserved server-side automatically.
function openVisitorForm(visitor) {
  var isEdit = !!(visitor && visitor.id);

  // Visitor ID is backend-generated, so it's only ever shown — never
  // entered — and only on Edit, where it's there purely for reference.
  var idFieldHtml = isEdit
    ? '<div class="form-group">'
        + '<label>Visitor ID</label>'
        + '<input type="text" id="fVisitorID" value="'+escapeHtml(visitor.id)+'" disabled>'
      + '</div>'
    : '';

  var todayStr = nowLabel();

  var bodyHtml = idFieldHtml
    + '<div class="form-group"><label>Visitor name</label><input type="text" id="fVisName" placeholder="e.g. Engr. Juan Dela Cruz" value="'+escapeHtml(isEdit ? visitor.name : '')+'"></div>'
    + '<div class="form-group"><label>Organization</label><input type="text" id="fVisOrg" placeholder="e.g. DPWH — Tarlac District Office" value="'+escapeHtml(isEdit ? visitor.org : '')+'"></div>'
    + '<div class="form-group"><label>Purpose of visit</label><textarea id="fVisPurpose" placeholder="e.g. Coordination meeting on road alignment">'+escapeHtml(isEdit ? visitor.purpose : '')+'</textarea></div>'
    + '<div class="form-row">'
    + '<div class="form-group"><label>Date &amp; time</label><input type="text" id="fVisDatetime" placeholder="Jul 2, 2026 · 9:30 AM" value="'+escapeHtml(isEdit ? visitor.datetime : todayStr)+'"></div>'
    + '<div class="form-group"><label>Host / division</label><input type="text" id="fVisHost" placeholder="e.g. GIS Unit" value="'+escapeHtml(isEdit ? visitor.host : '')+'"></div>'
    + '</div>'
    + '<div class="form-error" id="fVisError">Please enter the visitor\'s name and organization.</div>';

  openModal(isEdit ? 'Edit Visitor' : 'Log Visitor', bodyHtml, async function(){

    const visError = document.getElementById('fVisError');

    const name = document.getElementById('fVisName').value.trim();
    const org = document.getElementById('fVisOrg').value.trim();
    const purpose = document.getElementById('fVisPurpose').value.trim() || '—';
    const datetime = document.getElementById('fVisDatetime').value.trim() || nowLabel();
    const host = document.getElementById('fVisHost').value.trim() || 'PPDO Front Desk';

    if (!name || !org) {

        visError.classList.add('show');

        return false;

    }

    const visitorData = {

        name: name,

        organization: org,

        purpose: purpose,

        datetime: datetime,

        host: host

    };

    const result = isEdit
      ? await updateVisitor(Object.assign({ visitorID: visitor.id }, visitorData))
      : await addVisitor(visitorData);

    if (!result.success) {

        alert(result.message);

        return false;

    }

    if (isEdit) {
        logActivity('Visitors', 'Update', visitor.id, 'Updated visitor record for ' + name + ' (' + org + ').');
    } else {
        var newVisitorId = (result.data && result.data.visitorID) || '';
        logActivity('Visitors', 'Create', newVisitorId, 'Logged visitor ' + name + ' from ' + org + '.');
    }

    await loadVisitors();

  });
}
document.getElementById('btnNewVisitor').addEventListener('click', function(){ openVisitorForm(); });
loadVisitors();