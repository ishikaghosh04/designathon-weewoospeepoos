(() => {
  const { url, publishableKey } = window.campusConfig ?? {};
  if (!url || !publishableKey) return;

  const account = document.querySelector("#campus-account");
  const editor = document.querySelector("#campus-editor");
  const signIn = document.querySelector("#campus-sign-in");
  const verify = document.querySelector("#campus-verify");
  const profileForm = document.querySelector("#campus-profile-form");
  const signOut = document.querySelector("#campus-sign-out");
  const cards = document.querySelector("#campus-cards");
  const addCard = document.querySelector("#campus-add-card");
  const releaseSaved = document.querySelector("#campus-release-saved");
  const status = document.querySelector("#campus-status");
  const viewer = document.querySelector("#campus-viewer");
  const viewerTitle = document.querySelector("#campus-viewer-title");
  const viewerBody = document.querySelector("#campus-viewer-body");
  const sharedFish = new Map();
  const bucket = "campus-fish";
  let client;
  let signedInId = null;
  let memberId = null;
  let accountRevision = 0;
  let oceanRevision = 0;
  let viewerRevision = 0;
  let profile;
  let pendingDrawing;
  let codeEmail;
  let busy = false;
  let releases = Promise.resolve();

  const stylesheet = document.createElement("link");
  stylesheet.rel = "stylesheet";
  stylesheet.href = "campus.css";
  document.head.append(stylesheet);
  account.hidden = false;
  account.addEventListener("click", () => {
    editor.showModal();
    if (memberId) loadEditorProfile();
  });

  function loadClientLibrary() {
    if (window.supabase) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0";
      script.onload = resolve;
      script.onerror = () => reject(new Error("Couldn’t load campus sign-in. Reload and try again."));
      document.head.append(script);
    });
  }

  async function result(request) {
    const { data, error } = await request;
    if (error) throw error;
    return data;
  }

  function refreshEditorControls() {
    addCard.disabled = cards.children.length >= 12;
    releaseSaved.hidden = !profile?.avatar_path && !pendingDrawing;
    [...cards.children].forEach((card, index) => {
      card.querySelector('[data-card-action="up"]').disabled = index === 0;
      card.querySelector('[data-card-action="down"]').disabled = index === cards.children.length - 1;
    });
  }

  function appendCard({ title = "", body = "" } = {}) {
    const template = document.querySelector("#campus-card-template");
    const card = template.content.firstElementChild.cloneNode(true);
    card.querySelector("input").value = title;
    card.querySelector("textarea").value = body;
    cards.append(card);
    return card;
  }

  function renderProfileForm() {
    profileForm.elements.displayName.value = profile?.display_name ?? nameInput.value;
    cards.replaceChildren();
    (profile?.cards ?? []).forEach(appendCard);
    refreshEditorControls();
  }

  async function loadEditorProfile() {
    const id = memberId;
    if (!id || busy) return;
    await editorAction(async () => {
      status.textContent = "Loading your profile…";
      profileForm.hidden = true;
      const data = await result(client.from("campus_profiles")
        .select("display_name,cards,avatar_path,avatar_width,avatar_height,published_at")
        .eq("id", id).maybeSingle());
      if (memberId !== id) return;
      profile = data;
      renderProfileForm();
      profileForm.hidden = false;
      status.textContent = data?.published_at ? "Your fish is in the shared ocean." : "Your profile is private.";
    });
  }

  // Defer Supabase calls until the auth callback has released its internal lock.
  async function synchronizeAccount(user) {
    const revision = ++accountRevision;
    signedInId = user?.id ?? null;
    memberId = null;
    codeEmail = null;
    profile = null;
    pendingDrawing = null;
    viewer.close();
    clearSharedOcean();
    signIn.hidden = Boolean(user);
    signOut.hidden = !user;
    verify.hidden = true;
    profileForm.hidden = true;
    account.textContent = user ? "Campus profile" : "Campus sign-in";
    if (!user) {
      status.textContent = "";
      return;
    }
    status.textContent = "Checking campus access…";
    try {
      const campus = await result(client.rpc("campus_membership"));
      if (revision !== accountRevision) return;
      if (!campus) {
        status.textContent = "This account needs a verified email from an approved university.";
        return;
      }
      memberId = user.id;
      status.textContent = "Signed in.";
      if (editor.open) loadEditorProfile();
      if (!ocean.hidden) refreshSharedOcean();
    } catch (error) {
      if (revision === accountRevision) status.textContent = error.message;
    }
  }

  async function editorAction(action) {
    if (busy || !client) return;
    busy = true;
    editor.setAttribute("aria-busy", "true");
    try {
      await action();
    } catch (error) {
      status.textContent = error.message || "Something went wrong. Please try again.";
    } finally {
      busy = false;
      editor.removeAttribute("aria-busy");
    }
  }

  signIn.addEventListener("submit", (event) => {
    event.preventDefault();
    editorAction(async () => {
      const email = signIn.elements.email.value.trim();
      await result(client.auth.signInWithOtp({ email }));
      codeEmail = email;
      verify.hidden = false;
      verify.elements.code.value = "";
      verify.elements.code.focus();
      status.textContent = `Enter the code sent to ${email}.`;
    });
  });

  verify.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!codeEmail) return;
    editorAction(async () => {
      await result(client.auth.verifyOtp({
        email: codeEmail, token: verify.elements.code.value.trim(), type: "email",
      }));
      verify.elements.code.value = "";
      status.textContent = "Checking campus access…";
    });
  });

  signOut.addEventListener("click", async () => {
    signOut.disabled = true;
    try {
      await result(client.auth.signOut({ scope: "local" }));
      signIn.reset();
      verify.reset();
    } catch (error) {
      status.textContent = error.message;
    } finally {
      signOut.disabled = false;
    }
  });

  addCard.addEventListener("click", () => {
    if (cards.children.length >= 12) return;
    appendCard().querySelector("input").focus();
    refreshEditorControls();
  });

  cards.addEventListener("click", (event) => {
    const button = event.target.closest("[data-card-action]");
    if (!button) return;
    const card = button.closest(".campus-card");
    switch (button.dataset.cardAction) {
      case "up":
        cards.insertBefore(card, card.previousElementSibling);
        break;
      case "down":
        cards.insertBefore(card.nextElementSibling, card);
        break;
      case "remove":
        card.remove();
        addCard.focus();
        break;
    }
    refreshEditorControls();
    if (card.isConnected) (button.disabled ? card.querySelector("input") : button).focus();
  });

  async function saveDraft() {
    if (!profileForm.reportValidity()) return false;
    const id = memberId;
    const name = profileForm.elements.displayName.value.trim();
    const fields = [...cards.children].map((card) => ({
      title: card.querySelector("input").value.trim(),
      body: card.querySelector("textarea").value.trim(),
    }));
    await releases;
    if (memberId !== id) return false;
    await result(client.rpc("save_campus_draft", { p_name: name, p_cards: fields }));
    if (memberId !== id) return false;
    profile = { ...profile, display_name: name, cards: fields, published_at: null };
    await refreshSharedOcean();
    return true;
  }

  profileForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!memberId) return;
    editorAction(async () => {
      if (await saveDraft()) status.textContent = "Private draft saved.";
    });
  });

  async function releaseAvatar(name, path, width, height) {
    await result(client.rpc("release_campus_fish", {
      p_name: name, p_avatar_path: path, p_width: width, p_height: height,
    }));
  }

  async function uploadDrawing({ data, id }) {
    const path = `${id}/${crypto.randomUUID()}.png`;
    const blob = await (await fetch(data.image)).blob();
    await result(client.storage.from(bucket).upload(path, blob, { contentType: "image/png" }));
    await releaseAvatar(data.name, path, data.width, data.height);
    // Reuse this browser's existing animated fish when it represents the published avatar.
    data.campusAvatarPath = path;
    try {
      localStorage.setItem(storageKey, JSON.stringify(savedFish));
    } catch {
      // The profile is already saved online.
    }
    return path;
  }

  releaseSaved.addEventListener("click", () => {
    const id = memberId;
    if (!id) return;
    editorAction(async () => {
      if (!(await saveDraft()) || memberId !== id) return;
      if (pendingDrawing) {
        await uploadDrawing(pendingDrawing);
        pendingDrawing = null;
      } else {
        await releaseAvatar(profile.display_name, profile.avatar_path, profile.avatar_width, profile.avatar_height);
      }
      editor.close();
      showOcean();
      notice.textContent = "Your fish is in the shared ocean.";
    });
  });

  window.addEventListener("ocean:release", ({ detail: { data } }) => {
    const id = memberId;
    if (!id) return;
    const drawing = { data, id };
    pendingDrawing = drawing;
    notice.textContent = "Releasing your fish into the shared ocean…";
    releases = releases.then(async () => {
      if (memberId !== id) return;
      try {
        await uploadDrawing(drawing);
        if (pendingDrawing === drawing) pendingDrawing = null;
        if (memberId !== id) return;
        notice.textContent = "Your fish is in the shared ocean.";
        if (!ocean.hidden) await refreshSharedOcean();
      } catch {
        if (memberId === id) {
          notice.textContent = "Your fish is saved here. Open Campus profile to retry releasing it online.";
        }
      }
    });
  });

  function removeSharedFish({ fish, local, imageUrl }) {
    fish.element.querySelector(".campus-fish-profile")?.remove();
    if (local) {
      fish.element.querySelector(".fish-label").textContent = fish.data.name;
      return;
    }
    fish.element.remove();
    const index = fishList.indexOf(fish);
    if (index !== -1) fishList.splice(index, 1);
    URL.revokeObjectURL(imageUrl);
  }

  function clearSharedOcean() {
    oceanRevision += 1;
    sharedFish.forEach(removeSharedFish);
    sharedFish.clear();
  }

  function addProfileButton(fish, row) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "campus-fish-profile";
    button.setAttribute("aria-label", `View ${row.display_name}’s profile`);
    button.setAttribute("aria-haspopup", "dialog");
    button.addEventListener("click", () => openFishProfile(row.id));
    button.addEventListener("focus", () => {
      const area = fish.x >= ocean.clientWidth ? "2" : "1";
      if ((ocean.dataset.area || "1") !== area) showOceanArea(area);
    });
    fish.element.append(button);
    return button;
  }

  async function refreshSharedOcean() {
    if (!memberId) return;
    const revision = ++oceanRevision;
    try {
      const rows = await result(client.from("campus_profiles")
        .select("id,display_name,avatar_path,avatar_width,avatar_height")
        .not("published_at", "is", null).order("id"));
      const images = await Promise.all(rows.map(async (row) => {
        if (sharedFish.get(row.id)?.path === row.avatar_path ||
            savedFish.some((fish) => fish.campusAvatarPath === row.avatar_path)) return null;
        const { data } = await client.storage.from(bucket).download(row.avatar_path);
        return data;
      }));
      if (revision !== oceanRevision) return;

      const nextIds = new Set(rows.map(({ id }) => id));
      for (const [id, record] of sharedFish) {
        if (!nextIds.has(id)) {
          removeSharedFish(record);
          sharedFish.delete(id);
        }
      }
      rows.forEach((row, index) => {
        const existing = sharedFish.get(row.id);
        if (existing?.path === row.avatar_path) {
          existing.button.setAttribute("aria-label", `View ${row.display_name}’s profile`);
          existing.fish.element.querySelector(".fish-label").textContent = row.display_name;
          return;
        }
        if (existing) {
          removeSharedFish(existing);
          sharedFish.delete(row.id);
        }
        const local = fishList.find((fish) => fish.data.campusAvatarPath === row.avatar_path);
        if (!local && !images[index]) return;
        const imageUrl = local ? null : URL.createObjectURL(images[index]);
        const fish = local ?? addFish({
          name: row.display_name, image: imageUrl, width: row.avatar_width, height: row.avatar_height,
        }, -1);
        fish.element.querySelector(".fish-label").textContent = row.display_name;
        const button = addProfileButton(fish, row);
        sharedFish.set(row.id, { fish, local: Boolean(local), path: row.avatar_path, imageUrl, button });
      });
      if (!ocean.hidden) layoutOcean();
    } catch {
      if (revision === oceanRevision) {
        clearSharedOcean();
        if (!ocean.hidden) notice.textContent = "Couldn’t load campus fish. Re-enter the ocean to try again.";
      }
    }
  }

  async function openFishProfile(id) {
    const revision = ++viewerRevision;
    const viewingAs = memberId;
    viewerTitle.textContent = "Fish profile";
    viewerBody.textContent = "Loading profile…";
    viewer.showModal();
    try {
      const row = await result(client.from("campus_profiles")
        .select("display_name,cards").eq("id", id).not("published_at", "is", null).maybeSingle());
      if (!viewer.open || memberId !== viewingAs || revision !== viewerRevision) return;
      if (!row) {
        viewerBody.textContent = "This profile is no longer available.";
        return;
      }
      viewerTitle.textContent = row.display_name;
      viewerBody.replaceChildren();
      row.cards.forEach(({ title, body }) => {
        const card = document.createElement("article");
        card.className = "campus-card";
        const heading = document.createElement("h3");
        heading.textContent = title;
        const content = document.createElement("p");
        content.textContent = body;
        card.append(heading, content);
        viewerBody.append(card);
      });
      if (!row.cards.length) viewerBody.textContent = "This fish hasn’t added any cards yet.";
    } catch {
      if (viewer.open && memberId === viewingAs && revision === viewerRevision) {
        viewerBody.textContent = "Couldn’t load this profile.";
      }
    }
  }

  window.addEventListener("ocean:show", refreshSharedOcean);

  async function startCampus() {
    if (!publishableKey.startsWith("sb_publishable_")) {
      throw new Error("Use the project’s publishable key in campus-config.js.");
    }
    await loadClientLibrary();
    client = window.supabase.createClient(url, publishableKey);
    client.auth.onAuthStateChange((event, session) => {
      if (event === "TOKEN_REFRESHED" || (event === "SIGNED_IN" && signedInId === session?.user.id)) return;
      setTimeout(() => synchronizeAccount(session?.user), 0);
    });
  }

  startCampus().catch((error) => { status.textContent = error.message; });
})();
