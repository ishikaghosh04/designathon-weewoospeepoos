const eventBoardDialog = document.querySelector("#events-dialog");
const eventBoardTabs = [...eventBoardDialog.querySelectorAll('[role="tab"]')];
const eventCardTemplate = document.querySelector("#event-card");
const eventsNow = document.querySelector("#events-now");
const eventsUpcoming = document.querySelector("#events-upcoming");
const eventForm = document.querySelector("#host-event-form");
const eventSubmit = document.querySelector("#event-submit");
const eventError = document.querySelector("#event-error");
const eventNotice = document.querySelector("#event-notice");
const fishProfileDialog = document.querySelector("#fish-profile-dialog");
const sampleHostProfiles = {
  "sample-fish-0": { name: "Mr. Tingles", pronouns: "he/him", year: "3rd year", hobbies: "Board games, making playlists, and late-night baking", online: true },
  "sample-fish-1": { name: "Swimjay", pronouns: "they/them", year: "2nd year", hobbies: "Campus trivia, swimming, and street photography", online: false },
  "sample-fish-2": { name: "Fishson", pronouns: "he/they", year: "1st year", hobbies: "Pickup basketball, cooking, and watching Dinos games", online: true },
  "sample-fish-3": { name: "Reef Me Alone", pronouns: "they/she", year: "4th year", hobbies: "Journaling, crochet, and quiet study sessions", online: false },
  "sample-fish-4": { name: "Swimbrina", pronouns: "she/her", year: "2nd year", hobbies: "Drop-in volleyball, singing, and open mic nights", online: true },
};
const eventStorageKey = "little-ocean-events-v1";
const eventSlotLimit = 8;
const eventDayFormat = new Intl.DateTimeFormat("en-US", {
  weekday: "short", month: "short", day: "numeric",
});
const eventTimeFormat = new Intl.DateTimeFormat("en-US", {
  hour: "numeric", minute: "2-digit",
});
let eventRecords = [];
let eventStorageAvailable = true;
let eventRefreshTimer;
let eventSubmitting = false;
let profileEventId;

// The latest released fish acts as the current identity until accounts exist.
// Saved fish are append-only. The index distinguishes fish with the same name.
function getEventFish() {
  const fish = savedFish.at(-1);
  return fish && { ...fish, id: `local-fish-${savedFish.length - 1}` };
}

function seedOceanEvents() {
  const now = Date.now();
  const minute = 60_000;
  const afternoon = (days, hour) => {
    const date = new Date(now);
    date.setDate(date.getDate() + days);
    date.setHours(hour, 0, 0, 0);
    return +date;
  };
  const examples = [
    ["Quiet study jam", "Bring something to work on. We’ll study quietly together.", "TFDL lobby", now - 15 * minute, now + 50 * minute],
    ["Board game break", "Drop in for a quick game between classes.", "MacEwan Student Centre", now - 25 * minute, now + 85 * minute],
    ["Group meal break", "Bring a snack or grab lunch and join us.", "MacEwan Hall food court", afternoon(1, 12), afternoon(1, 13)],
    ["Journaling drop-in", "Bring a notebook for a low-key afternoon break.", "Rozsa Centre lobby", afternoon(2, 14), afternoon(2, 15)],
    ["Drop-in sports meetup", "Meet up and head to drop-in sports as a group.", "Kinesiology lobby", afternoon(3, 15), afternoon(3, 16)],
  ];
  return examples.map(([title, description, location, start, end], index) => {
    const fish = makeSample(samples[index], index);
    const hostFishId = `sample-fish-${index}`;
    const { name } = sampleHostProfiles[hostFishId];
    return {
      id: `sample-event-${index}`, title, description, location, hostFishId,
      hostFishName: name, hostFishImage: fish.image,
      startDateTime: new Date(start).toISOString(),
      endDateTime: new Date(end).toISOString(),
      joinedFishNames: [name],
      joinedFishIds: [hostFishId],
    };
  });
}

// Keep persistence here so a future account-backed store can replace it.
function saveOceanEvents(events) {
  eventRecords = events;
  if (!eventStorageAvailable) return;
  try {
    localStorage.setItem(eventStorageKey, JSON.stringify(events));
  } catch {
    eventStorageAvailable = false;
  }
}

function loadOceanEvents() {
  if (!eventStorageAvailable) return;
  try {
    const stored = localStorage.getItem(eventStorageKey);
    if (stored === null) {
      saveOceanEvents(seedOceanEvents());
      return;
    }
    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed)) eventRecords = parsed;
  } catch {
    eventStorageAvailable = false;
    if (!eventRecords.length) eventRecords = seedOceanEvents();
  }
}

function activeOceanEvents(now = Date.now()) {
  return eventRecords
    .filter((event) => Date.parse(event.endDateTime) > now)
    .sort((a, b) => Date.parse(a.startDateTime) - Date.parse(b.startDateTime));
}

function withOceanEvents(action) {
  const update = () => {
    loadOceanEvents();
    return action(activeOceanEvents());
  };
  // Serialize edits across tabs where Web Locks are available.
  return navigator.locks ? navigator.locks.request(eventStorageKey, update) : update();
}

function selectEventTab(selected) {
  if (selected === eventBoardTabs[1]) eventNotice.textContent = "";
  for (const tab of eventBoardTabs) {
    const active = tab === selected;
    tab.tabIndex = active ? 0 : -1;
    tab.setAttribute("aria-selected", String(active));
    document.getElementById(tab.getAttribute("aria-controls")).hidden = !active;
  }
}

eventBoardTabs.forEach((tab, index) => {
  tab.addEventListener("click", () => selectEventTab(tab));
  tab.addEventListener("keydown", (event) => {
    const nextIndex = { ArrowLeft: 1 - index, ArrowRight: 1 - index, Home: 0, End: 1 }[event.key];
    if (nextIndex === undefined) return;
    event.preventDefault();
    selectEventTab(eventBoardTabs[nextIndex]);
    eventBoardTabs[nextIndex].focus();
  });
});

function openEventHostProfile(event) {
  // The same IDs also identify sample hosts in events saved before profiles existed.
  const sample = sampleHostProfiles[event.hostFishId];
  const profile = sample ?? {
    name: event.hostFishName,
    pronouns: "Not set",
    year: "Not set",
    hobbies: "Not set",
    online: getEventFish()?.id === event.hostFishId,
  };
  profileEventId = event.id;
  showFishProfile(profile, {
    note: sample ? "Sample profile. Status is for the demo." : "Status reflects the fish currently in use in this browser.",
    closeLabel: "Back to events",
  });
}

function showFishProfile(profile, { note, closeLabel, social = false }) {
  document.querySelector("#fish-profile-name").textContent = profile.name;
  document.querySelector("#fish-profile-pronouns").textContent = profile.pronouns;
  document.querySelector("#fish-profile-year").textContent = profile.year;
  document.querySelector("#fish-profile-hobbies").textContent = profile.hobbies;
  const status = document.querySelector("#fish-profile-status");
  status.textContent = profile.online ? "Online" : "Offline";
  status.dataset.online = String(profile.online);
  document.querySelector("#fish-profile-note").textContent = note;
  document.querySelector("#fish-profile-close").textContent = closeLabel;
  document.querySelector("#fish-profile-social").hidden = !social;
  fishProfileDialog.showModal();
}

fishProfileDialog.addEventListener("close", () => {
  if (!profileEventId) return;
  const trigger = eventBoardDialog.querySelector(`[data-profile-event-id="${CSS.escape(profileEventId)}"]`);
  profileEventId = null;
  (trigger || eventBoardTabs[0]).focus();
});

function createEventCard(event, fish) {
  const card = eventCardTemplate.content.firstElementChild.cloneNode(true);
  const start = new Date(event.startDateTime);
  const end = new Date(event.endDateTime);
  const startDay = eventDayFormat.format(start);
  const endDay = eventDayFormat.format(end);
  const endLabel = endDay === startDay ? eventTimeFormat.format(end) : `${endDay} · ${eventTimeFormat.format(end)}`;
  card.querySelector("h4").textContent = event.title;
  card.querySelector(".event-description").textContent = event.description;
  const profileButton = card.querySelector(".event-host button");
  profileButton.textContent = sampleHostProfiles[event.hostFishId]?.name ?? event.hostFishName;
  profileButton.dataset.profileEventId = event.id;
  profileButton.addEventListener("click", () => openEventHostProfile(event));
  card.querySelector(".event-location").textContent = event.location;
  const time = card.querySelector("time");
  time.dateTime = event.startDateTime;
  time.textContent = `${startDay} · ${eventTimeFormat.format(start)}–${endLabel}`;
  card.querySelector(".event-count").textContent = `${event.joinedFishNames.length} fish joined`;

  const host = event.hostFishId === fish?.id;
  const joined = event.joinedFishIds.includes(fish?.id);
  card.querySelector(".event-joined").hidden = !joined;
  const button = card.querySelector(".event-rsvp");
  button.dataset.eventId = event.id;
  button.textContent = host ? "You're hosting" : joined ? "Leave" : "Join";
  button.disabled = !fish || host;
  button.setAttribute("aria-label", `${button.textContent} · ${event.title}`);
  return card;
}

function hostingRestriction(events, fish) {
  const atCapacity = events.length >= eventSlotLimit;
  const alreadyHosting = fish && events.some((event) => event.hostFishId === fish.id);
  if (atCapacity) {
    const full = "All 8 arms are busy. Check back when an event ends.";
    return alreadyHosting ? `${full} Your fish already hosts an active event.` : full;
  }
  if (!fish) return "Draw and release a fish before hosting an event.";
  if (alreadyHosting) {
    return "Your fish already hosts an active event. You can host again after it ends.";
  }
  return "";
}

function refreshEventBoard() {
  clearTimeout(eventRefreshTimer);
  const now = Date.now();
  const events = activeOceanEvents(now);
  const fish = getEventFish();
  const focusedEventId = document.activeElement?.dataset.eventId;
  const current = [];
  const upcoming = [];
  let nextChange = Infinity;
  for (const event of events) {
    const start = Date.parse(event.startDateTime);
    const card = createEventCard(event, fish);
    (start <= now ? current : upcoming).push(card);
    if (start > now) nextChange = Math.min(nextChange, start);
    nextChange = Math.min(nextChange, Date.parse(event.endDateTime));
  }
  eventsNow.replaceChildren(...current);
  eventsUpcoming.replaceChildren(...upcoming);
  eventsNow.parentElement.hidden = !current.length;
  eventsUpcoming.parentElement.hidden = !upcoming.length;
  document.querySelector("#event-empty").hidden = events.length > 0;
  document.querySelector("#event-arms").textContent = `Arms in use: ${events.length} of ${eventSlotLimit}`;
  const restriction = hostingRestriction(events, fish);
  document.querySelector("#event-host-status").textContent = restriction;
  eventSubmit.disabled = Boolean(restriction) || eventSubmitting;
  const identity = fish ? `Playing as ${fish.name}.` : "Draw and release a fish to join or host an event.";
  document.querySelector("#event-fish-status").textContent = eventStorageAvailable
    ? identity : `${identity} Browser storage is unavailable. Changes will last for this visit.`;

  if (focusedEventId) {
    const action = eventBoardDialog.querySelector(`[data-event-id="${CSS.escape(focusedEventId)}"]`);
    (action || eventBoardTabs[0]).focus();
  }
  if (eventBoardDialog.open && Number.isFinite(nextChange)) {
    eventRefreshTimer = setTimeout(refreshEventBoard, Math.min(nextChange - now, 2_147_483_647));
  }
}

document.querySelector("#octopus-events").addEventListener("click", () => {
  loadOceanEvents();
  eventNotice.textContent = "";
  selectEventTab(eventBoardTabs[0]);
  eventBoardDialog.showModal();
  refreshEventBoard();
  eventBoardTabs[0].focus();
});

eventBoardDialog.addEventListener("close", () => clearTimeout(eventRefreshTimer));
window.addEventListener("storage", (event) => {
  if (eventBoardDialog.open && (event.key === eventStorageKey || event.key === null)) {
    loadOceanEvents();
    refreshEventBoard();
  }
});

document.querySelector("#browse-events").addEventListener("click", async (click) => {
  const button = click.target.closest("[data-event-id]");
  const fish = getEventFish();
  if (!button || !fish) return;
  const eventId = button.dataset.eventId;
  const wantsToJoin = button.textContent === "Join";
  try {
    eventNotice.textContent = await withOceanEvents((events) => {
      const event = events.find(({ id }) => id === eventId);
      if (!event) return "That event has ended.";
      if (event.hostFishId === fish.id) return "You're already counted as the host.";
      const index = event.joinedFishIds.indexOf(fish.id);
      if (wantsToJoin && index === -1) {
        event.joinedFishIds.push(fish.id);
        event.joinedFishNames.push(fish.name);
      } else if (!wantsToJoin && index !== -1) {
        event.joinedFishIds.splice(index, 1);
        event.joinedFishNames.splice(index, 1);
      }
      saveOceanEvents(events);
      return wantsToJoin ? `You joined ${event.title}.` : `You left ${event.title}.`;
    });
  } catch {
    eventNotice.textContent = "Couldn’t update your RSVP. Please try again.";
  }
  refreshEventBoard();
});

function showEventError(message = "") {
  eventError.textContent = message;
  eventError.hidden = !message;
}

async function makeEventThumbnail(source) {
  const image = new Image();
  image.src = source;
  await image.decode();
  const thumbnail = document.createElement("canvas");
  const scale = Math.min(1, 72 / image.naturalWidth, 48 / image.naturalHeight);
  thumbnail.width = Math.max(1, Math.round(image.naturalWidth * scale));
  thumbnail.height = Math.max(1, Math.round(image.naturalHeight * scale));
  thumbnail.getContext("2d").drawImage(image, 0, 0, thumbnail.width, thumbnail.height);
  return thumbnail.toDataURL("image/png");
}

eventForm.addEventListener("submit", async (submit) => {
  submit.preventDefault();
  if (eventSubmitting) return;
  showEventError();
  const fish = getEventFish();
  const restriction = hostingRestriction(activeOceanEvents(), fish);
  if (restriction) return showEventError(restriction);

  const fields = new FormData(eventForm);
  const title = fields.get("title").trim();
  const description = fields.get("description").trim();
  const location = fields.get("location").trim();
  const date = fields.get("date");
  const start = fields.get("start");
  const end = fields.get("end");
  if (![title, description, location, date, start, end].every(Boolean)) {
    return showEventError("Fill in every field before hosting.");
  }
  if (title.length > 50 || description.length > 200) {
    return showEventError("Keep the title to 50 characters and the description to 200.");
  }
  const startsAt = new Date(`${date}T${start}`);
  const endsAt = new Date(`${date}T${end}`);
  if (!(endsAt > startsAt)) return showEventError("End time must be after start time.");
  if (endsAt <= Date.now()) return showEventError("Choose an end time in the future.");

  eventSubmitting = true;
  eventSubmit.disabled = true;
  try {
    const hostFishImage = await makeEventThumbnail(fish.image);
    const error = await withOceanEvents((events) => {
      const blocked = hostingRestriction(events, fish);
      if (blocked) return blocked;
      if (endsAt <= Date.now()) return "Choose an end time in the future.";
      events.push({
        id: crypto.randomUUID(), title, description, location,
        hostFishId: fish.id, hostFishName: fish.name, hostFishImage,
        startDateTime: startsAt.toISOString(), endDateTime: endsAt.toISOString(),
        joinedFishNames: [fish.name], joinedFishIds: [fish.id],
      });
      saveOceanEvents(events);
      return "";
    });
    if (error) return showEventError(error);
    eventForm.reset();
    eventNotice.textContent = `${title} is on the board. You're counted as the host.`;
    selectEventTab(eventBoardTabs[0]);
    if (eventBoardDialog.open) eventBoardTabs[0].focus();
  } catch {
    showEventError("Couldn’t save the event. Please try again.");
  } finally {
    eventSubmitting = false;
    refreshEventBoard();
  }
});
