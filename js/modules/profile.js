const PROFILE_KEY = 'songbook-profile';

export const PROFILE_INSTRUMENTALIST = 'instrumentalist';
export const PROFILE_VOCALIST = 'vocalist';
const VALID_PROFILES = [PROFILE_INSTRUMENTALIST, PROFILE_VOCALIST];

function normalizeProfile(value) {
  if (typeof value !== 'string') return PROFILE_INSTRUMENTALIST;
  return VALID_PROFILES.includes(value) ? value : PROFILE_INSTRUMENTALIST;
}

export function getSavedProfile() {
  try {
    return normalizeProfile(localStorage.getItem(PROFILE_KEY));
  } catch (error) {
    console.warn('Błąd odczytu profilu:', error);
    return PROFILE_INSTRUMENTALIST;
  }
}

export function saveProfile(profile) {
  const normalized = normalizeProfile(profile);
  try {
    localStorage.setItem(PROFILE_KEY, normalized);
  } catch (error) {
    console.warn('Błąd zapisu profilu:', error);
  }
  return normalized;
}

function applyProfileToBody(profile) {
  document.body.dataset.profile = normalizeProfile(profile);
}

export function initProfileControl(selectElement, { onChange } = {}) {
  const initial = getSavedProfile();
  applyProfileToBody(initial);

  if (!selectElement) {
    return initial;
  }

  selectElement.value = initial;
  selectElement.addEventListener('change', (event) => {
    const next = saveProfile(event.target.value);
    applyProfileToBody(next);
    if (typeof onChange === 'function') {
      onChange(next);
    }
  });

  return initial;
}

export function setProfile(profile, selectElement) {
  const normalized = saveProfile(profile);
  if (selectElement) {
    selectElement.value = normalized;
  }
  applyProfileToBody(normalized);
  return normalized;
}
