/* =======================================================================
   calendar.js — Office calendar: month grid, per-day event list, and the
   add/edit event form.

   Depends on api.js (escapeHtml, openModal/closeModal, pad2, dateKey,
   getCalendar, addEvent, updateEvent, deleteEvent, removeEventPermanently).

   CRUD wiring mirrors employees.js: loadCalendarEvents() plays the role of
   loadEmployees() (fetch → filter active → render), the Add/Edit modal in
   openEventForm() plays the role of openEmployeeForm(), and deletion is the
   same two-tier soft-delete-with-a-permanent-remove-link pattern used by
   wireEmployeeRows()/openPermanentRemoveModal().
   ======================================================================= */

/* ---------------- Office calendar ---------------- */
var calToday = new Date();
var calViewYear = calToday.getFullYear();
var calViewMonth = calToday.getMonth();
var calSelectedKey = dateKey(calToday.getFullYear(), calToday.getMonth(), calToday.getDate());

// Populated by loadCalendarEvents() below — keyed by "yyyy-mm-dd", each
// value an array of {id, name, start, end, description}. No more local
// seed data: this now mirrors the `employees` array in employees.js,
// which only ever holds what the backend last returned.
var calEvents = {};

var weekdayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
var monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// getCalendar() is supposed to always hand back "Event Date" as a plain
// "yyyy-MM-dd" string (see formatIfDate_ in calendar.gs). But if the
// script/spreadsheet timezone mismatch that helper guards against ever
// slips through unformatted, Sheets' Date object gets JSON.stringify'd
// into a full ISO timestamp (e.g. "2026-07-14T00:00:00.000Z") instead of
// a plain date. That string no longer matches the "yyyy-MM-dd" keys used
// by dateKey()/calSelectedKey, so the event would silently vanish from
// calEvents. This normalizes either shape down to "yyyy-MM-dd" instead
// of just dropping the event.
function normalizeDateKey_(value) {
  if (!value) return '';
  var match = String(value).trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : String(value).trim();
}

// Fetches every active calendar event from the backend and rebuilds the
// date-keyed calEvents map, then re-renders the grid. Mirrors
// loadEmployees() in employees.js: try/catch, bail out on a failed
// response (logging instead of throwing), filter to isActive rows only,
// then hand off to the render function.
async function loadCalendarEvents() {
  try {

    const result = await getCalendar();

    if (!result.success) {
      console.error(result.message);
      return;
    }

    calEvents = {};

    // Property names below match the live Calendar sheet's headers
    // exactly (including "End time" — lowercase "t", unlike "Start Time"
    // right next to it), not a camelCase guess.
    result.data
      .filter(ev => ev.isActive !== false && ev.isActive !== "FALSE")
      .forEach(ev => {

        const key = normalizeDateKey_(ev["Event Date"]);
        if (!key) return;

        if (!calEvents[key]) calEvents[key] = [];

        calEvents[key].push({
          id: ev.EventID,
          name: ev["Event Name"] || "",
          start: ev["Start Time"] || "",
          end: ev["End time"] || "",
          description: ev["Description"] || ""
        });

      });

    renderCalendar();

  } catch (err) {

    console.error("Failed to load calendar events:", err);

  }
}

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
      openCalDayModal(cellEl.dataset.key);
    });
  });
}

function friendlyDateLabel(key){
  var parts = key.split('-').map(Number);
  var d = new Date(parts[0], parts[1]-1, parts[2]);
  return d.toLocaleDateString(undefined, {weekday:'long', month:'long', day:'numeric', year:'numeric'});
}

// Builds the same event-list markup that used to live in the static
// side panel — unchanged, just returned as a string instead of being
// written straight into a fixed container.
function calEventListHtml(key){
  var list = calEvents[key] || [];
  if(!list.length){
    return '<p style="font-size:12.5px; color:var(--ink-soft); margin:6px 0 0;">No events scheduled for this day.</p>';
  }
  return list.map(function(ev){
    var actions = adminSignedIn
      ? '<div class="cal-event-actions"><button data-edit="'+ev.id+'" title="Edit">✎</button><button data-del="'+ev.id+'" title="Delete">✕</button></div>'
      : '';
    return '<div class="cal-event-list-item">'
      + '<div style="display:flex; gap:8px;"><div class="cal-event-dot"></div>'
      + '<div><h5 style="margin:0 0 2px; font-size:13px;">'+escapeHtml(ev.name)+'</h5>'
      + '<span style="font-size:11.5px; color:var(--ink-soft);">'+escapeHtml(ev.start)+' – '+escapeHtml(ev.end)+'</span>'
      + (ev.description ? '<p style="font-size:12px; color:var(--ink-soft); margin:4px 0 0;">'+escapeHtml(ev.description)+'</p>' : '')
      + '</div></div>'
      + actions
      + '</div>';
  }).join('');
}

// Opens a day's events as a popup (via the shared openModal() used
// everywhere else in the app — see api.js) instead of writing into a
// static side panel. hideFoot:true since this is just a read-only list
// with its own Edit/Delete buttons, not a Save/Cancel form.
function openCalDayModal(key){
  calSelectedKey = key;
  openModal(friendlyDateLabel(key), calEventListHtml(key), null, { hideFoot: true });
  wireCalEventListActions();
}

// Wires the Edit/Delete buttons inside the popup body. Reads from the
// shared #modalBody (modalBody global from api.js) now that the list
// lives inside the modal instead of a fixed #calEventList container.
function wireCalEventListActions(){
  modalBody.querySelectorAll('[data-edit]').forEach(function(btn){
    btn.addEventListener('click', function(){ openEventForm(calSelectedKey, btn.dataset.edit); });
  });

  // Soft-delete with a confirmation modal, plus a link through to a
  // separate permanent-remove confirmation — same two-step flow as
  // wireEmployeeRows()'s remove button in employees.js. Confirming
  // swaps this popup's content for the confirmation in place (openModal
  // reuses the same modal box), same behavior as everywhere else that
  // opens a confirmation from inside an already-open modal.
  modalBody.querySelectorAll('[data-del]').forEach(function(btn){
    btn.addEventListener('click', function(){
      var id = btn.dataset.del;
      var ev = (calEvents[calSelectedKey]||[]).find(function(x){ return x.id === id; });
      var rawName = ev ? ev.name : 'this event';
      var name = escapeHtml(rawName);

      openModal(
        'Delete Event',
        '<p>Are you sure you want to delete <strong>'+name+'</strong>?</p>'
          + '<p style="color:var(--ink-soft); font-size:12.5px;">This is a soft delete — the record stays in Google Sheets, it just stops appearing here.</p>'
          + '<p style="margin-top:14px;"><a href="#" id="lnkRemoveEventPermanent" style="color:var(--ink-soft); font-size:12.5px; text-decoration:underline;">Remove this record permanently instead</a></p>',
        async function(){
          const result = await deleteEvent(id);
          if(!result.success){
            alert(result.message);
            return false;
          }
          logActivity('Calendar', 'Delete', id, 'Archived event ' + rawName + ' (soft delete).');
          await loadCalendarEvents();
        },
        { saveLabel: 'Delete', saveClass: 'btn btn-danger' }
      );

      var lnk = document.getElementById('lnkRemoveEventPermanent');
      if(lnk){
        lnk.addEventListener('click', function(linkEv){
          linkEv.preventDefault();
          closeModal();
          openPermanentRemoveEventModal(id, name, rawName);
        });
      }
    });
  });
}

// Second, separate confirmation for the irreversible permanent delete —
// reached via the link inside the soft-delete modal above, mirroring
// openPermanentRemoveModal() in employees.js.
function openPermanentRemoveEventModal(id, name, rawName){
  openModal(
    'Remove Event Permanently',
    '<p>Are you sure you want to permanently remove <strong>'+name+'</strong>?</p>'
      + '<p style="color:var(--ink-soft); font-size:12.5px;">This action cannot be undone.</p>',
    async function(){
      const result = await removeEventPermanently(id);
      if(!result.success){
        alert(result.message);
        return false;
      }
      logActivity('Calendar', 'Delete', id, 'Permanently removed event ' + (rawName || name) + '.');
      await loadCalendarEvents();
    },
    { saveLabel: 'Remove Permanently', saveClass: 'btn btn-danger' }
  );
}

// Shared Add/Edit modal. Call with a date key and no eventId to add a new
// event on that date, or pass an existing eventId to edit it in place.
// Event ID is never user-editable: the backend generates it (so the Add
// form has no ID field at all), and on Edit it's shown disabled, for
// reference only — same treatment as Employee ID in openEmployeeForm().
function openEventForm(dateKeyForForm, eventId){
  var existing = eventId ? (calEvents[dateKeyForForm]||[]).find(function(ev){ return ev.id === eventId; }) : null;

  var idFieldHtml = existing
    ? '<div class="form-group"><label>Event ID</label><input type="text" id="fEventID" value="'+escapeHtml(existing.id)+'" disabled></div>'
    : '';

  var bodyHtml =
    idFieldHtml
    + '<div class="form-group"><label>Event date</label><input type="date" id="fEventDate" value="'+(dateKeyForForm||calSelectedKey)+'"></div>'
    + '<div class="form-group"><label>Event name</label><input type="text" id="fEventName" placeholder="e.g. Budget Hearing" value="'+escapeHtml(existing?existing.name:'')+'"></div>'
    + '<div class="form-row">'
    + '<div class="form-group"><label>Start time</label><input type="text" id="fEventStart" placeholder="9:00 AM" value="'+escapeHtml(existing?existing.start:'')+'"></div>'
    + '<div class="form-group"><label>End time</label><input type="text" id="fEventEnd" placeholder="11:00 AM" value="'+escapeHtml(existing?existing.end:'')+'"></div>'
    + '</div>'
    + '<div class="form-group"><label>Description</label><textarea id="fEventDesc" placeholder="Optional details">'+escapeHtml(existing?existing.description:'')+'</textarea></div>'
    + '<div class="form-error" id="fEventError">Please enter an event name and date.</div>';

  openModal(existing ? 'Edit Event' : 'Add Event', bodyHtml, async function(){

    const eventError = document.getElementById('fEventError');

    var newKey = document.getElementById('fEventDate').value;
    var name = document.getElementById('fEventName').value.trim();
    var start = document.getElementById('fEventStart').value.trim() || 'All day';
    var end = document.getElementById('fEventEnd').value.trim() || '';
    var desc = document.getElementById('fEventDesc').value.trim();

    if(!newKey || !name){
      eventError.classList.add('show');
      return false;
    }

    // Keys match the live Calendar sheet's headers exactly (see
    // loadCalendarEvents() above for the same mapping in reverse).
    const eventData = {
      "Event Date": newKey,
      "Event Name": name,
      "Start Time": start,
      "End time": end,
      "Description": desc
    };

    const result = existing
      ? await updateEvent(Object.assign({ EventID: eventId }, eventData))
      : await addEvent(eventData);

    if(!result.success){
      alert(result.message);
      return false;
    }

    if(existing){
      logActivity('Calendar', 'Update', eventId, 'Updated event ' + name + ' — ' + newKey + '.');
    } else {
      var newEventId = (result.data && result.data.EventID) || '';
      logActivity('Calendar', 'Create', newEventId, 'Added event ' + name + ' on ' + newKey + '.');
    }

    calSelectedKey = newKey;
    var parts = newKey.split('-').map(Number);
    calViewYear = parts[0]; calViewMonth = parts[1]-1;

    await loadCalendarEvents();

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
loadCalendarEvents();