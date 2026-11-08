(() => {
  // Placeholder fish stay near their activity and are separate from real campus profiles.
  const profiles = [
    { id: "finley", asset: "coral-clownfish", activity: "intramurals", name: "Finley", pronouns: "he/him", year: "2nd year", hobbies: "Dinos games, photography, and making playlists" },
    { id: "goldie", asset: "lemon-tang", activity: "study", name: "Goldie", pronouns: "she/her", year: "3rd year", hobbies: "Board games, trivia, and baking" },
    { id: "plum", asset: "lavender-betta", activity: "study", name: "Plum", pronouns: "they/them", year: "4th year", hobbies: "Library study jams, crochet, and puzzle books" },
    { id: "mochi", asset: "mint-pufferfish", activity: "study", name: "Mochi", pronouns: "she/they", year: "1st year", hobbies: "Cooking, café hopping, and sketching" },
    { id: "blue", asset: "blue-sardine", activity: "intramurals", name: "Blue", pronouns: "he/they", year: "3rd year", hobbies: "Drop-in sports, playing guitar, and collecting records" },
    { id: "rosie", asset: "rose-angelfish", activity: "cultural-events", name: "Rosie", pronouns: "she/her", year: "2nd year", hobbies: "Cultural festivals, dance, and film" },
    { id: "nori", asset: "seafoam-wrasse", activity: "cultural-events", name: "Nori", pronouns: "they/them", year: "1st year", hobbies: "Journaling, watercolour, and tea breaks" },
  ];
  const form = document.querySelector("#demo-message-form");
  const messageInput = document.querySelector("#demo-message");
  const requestButton = document.querySelector("#demo-friend-request");
  const history = document.querySelector("#demo-message-history");
  const status = document.querySelector("#demo-social-status");
  const storageKey = "little-ocean-demo-social-v1";
  let activeProfile;
  let state = {};
  let canPersist = true;

  function readSocialState() {
    if (!canPersist) return;
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? "{}");
      state = saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
    } catch {
      canPersist = false;
    }
  }

  function contactState() {
    const contact = state[activeProfile.id];
    return {
      requested: contact?.requested === true,
      messages: Array.isArray(contact?.messages) ? contact.messages.filter((message) => typeof message === "string") : [],
    };
  }

  function saveContact(contact) {
    state[activeProfile.id] = contact;
    if (!canPersist) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      canPersist = false;
    }
  }

  function renderContact() {
    const { requested, messages } = contactState();
    requestButton.disabled = requested;
    requestButton.textContent = requested ? "Friend request sent" : "Send friend request";
    history.replaceChildren(...messages.map((message) => {
      const entry = document.createElement("li");
      entry.textContent = message;
      return entry;
    }));
    history.hidden = !messages.length;
  }

  function openDemoFish(profile, activityTitle) {
    activeProfile = profile;
    readSocialState();
    messageInput.value = "";
    status.textContent = "";
    renderContact();
    showFishProfile({ ...profile, online: true }, {
      closeLabel: "Back to ocean",
      note: `Demo fish at ${activityTitle}. Messages and requests stay in this browser.`,
      social: true,
    });
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!activeProfile) return;
    const message = messageInput.value.trim();
    if (!message || message.length > 160) {
      status.textContent = "Enter a message between 1 and 160 characters.";
      return;
    }
    readSocialState();
    const contact = contactState();
    contact.messages = [...contact.messages, message].slice(-5);
    saveContact(contact);
    messageInput.value = "";
    renderContact();
    status.textContent = canPersist ? "Demo message saved." : "Demo message saved for this visit.";
  });

  requestButton.addEventListener("click", () => {
    if (!activeProfile) return;
    readSocialState();
    const contact = contactState();
    saveContact({ ...contact, requested: true });
    renderContact();
    status.textContent = canPersist ? "Demo friend request saved." : "Demo request saved for this visit.";
    messageInput.focus();
  });

  fishProfileDialog.addEventListener("close", () => { activeProfile = null; });

  const groupSizes = new Map();
  const offsets = [
    [-0.78, 0.15],
    [0.76, 0.42],
    [-0.06, 1],
  ];
  const markers = profiles.map((profile, index) => {
    const { panel, button: hotspot, title } = activityHotspots.get(profile.activity);
    const slot = groupSizes.get(profile.activity) ?? 0;
    groupSizes.set(profile.activity, slot + 1);
    const marker = document.createElement("button");
    marker.type = "button";
    marker.className = "demo-fish";
    marker.setAttribute("aria-haspopup", "dialog");
    marker.setAttribute("aria-label", `View demo profile for ${profile.name} at ${title}`);
    marker.title = `${profile.name} · Demo`;
    marker.style.setProperty("--fish-facing", slot === 1 ? "-1" : "1");
    marker.style.setProperty("--fish-period", `${2.8 + index * 0.17}s`);
    marker.style.setProperty("--fish-delay", `${-index * 0.7}s`);
    const image = document.createElement("img");
    image.src = `./assets/${profile.asset}.png`;
    image.alt = "";
    marker.append(image);
    marker.addEventListener("click", () => openDemoFish(profile, title));
    panel.append(marker);
    return { panel, hotspot, marker, slot };
  });

  function layoutDemoFish() {
    if (ocean.hidden) return;
    const headerBottom = ocean.querySelector(".ocean-header").offsetHeight + 8;
    for (const { panel, hotspot, marker, slot } of markers) {
      const [across, depth] = offsets[slot];
      const halfWidth = marker.offsetWidth / 2;
      const height = marker.offsetHeight;
      const x = clamp(hotspot.offsetLeft + across * (marker.offsetWidth + 8),
        halfWidth + 8, panel.clientWidth - halfWidth - 8);
      const upperHotspot = hotspot.offsetTop < panel.clientHeight / 2;
      const checkedIn = hotspot.hasAttribute("data-active");
      const y = upperHotspot
        ? hotspot.offsetTop + hotspot.offsetHeight + (checkedIn ? 92 : 36) + depth * height
        : hotspot.offsetTop - height - (checkedIn ? 135 : 18) - depth * height;
      marker.style.left = `${x}px`;
      marker.style.top = `${clamp(y, headerBottom, panel.clientHeight - height - 8)}px`;
    }
  }

  window.addEventListener("ocean:show", layoutDemoFish);
  window.addEventListener("resize", layoutDemoFish);
  const checkInObserver = new MutationObserver(layoutDemoFish);
  for (const { hotspot } of markers) checkInObserver.observe(hotspot, { attributeFilter: ["data-active"] });
})();
