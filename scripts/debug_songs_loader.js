(async function debugSongsLoader() {
  try {
    const resourceRel = 'js/modules/songs.js';
    console.group('%cDebug: songs.js loader', 'color:teal;font-weight:bold');

    // 1) Script tags snapshot
    const scripts = Array.from(document.scripts).map(s => ({
      src: s.src || '(inline)',
      type: s.type || '(default)',
      defer: !!s.defer,
      async: !!s.async
    }));
    console.log('Script tags snapshot:', scripts);

    // 2) Any script tag directly referencing songs.js?
    const matchedScriptTags = Array.from(document.querySelectorAll('script[src]'))
      .filter(s => s.src.endsWith(resourceRel) || s.src.includes('/' + resourceRel))
      .map(s => ({ src: s.src, type: s.type || '(default)', outer: s.outerHTML.slice(0,400) }));
    console.log('Direct <script> tags referencing songs.js:', matchedScriptTags);

    // 3) Performance resource entry (initiatorType etc.)
    const perfEntry = performance.getEntriesByType('resource').find(r => r.name.endsWith(resourceRel) || r.name.includes('/' + resourceRel));
    console.log('Performance resource entry for songs.js:', perfEntry || null);

    // 4) Fetch songs.js (no-cache) and print response headers + length
    try {
      const resp = await fetch(resourceRel, { cache: 'no-store' });
      console.log('Fetch result: status=', resp.status, 'type=', resp.type);
      console.log('Response headers:');
      for (const [k, v] of resp.headers) console.log('  ', k, ':', v);
      const text = await resp.text();
      console.log('Fetched length:', text.length);
      console.log('Fetched snippet (first 1200 chars):\n', text.slice(0, 1200));
    } catch (fetchErr) {
      console.error('Fetch failed for', resourceRel, fetchErr);
    }

    // 5) Service worker registrations
    if ('serviceWorker' in navigator) {
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        console.log('Service Worker registrations:', regs.length, regs);
      } catch (swErr) {
        console.warn('Error reading service worker registrations:', swErr);
      }
    } else {
      console.log('Service Workers not supported in this environment.');
    }

    // 6) Offer automated unregister+reload helper
    console.log('\nAutomated helper:');
    console.log(' - To unregister all service workers and reload, call: debugSongsLoader_doUnregisterAndReload()');
    console.log(' - To just unregister without reload, call: debugSongsLoader_doUnregister()');

    // Expose helpers on window
    window.debugSongsLoader_doUnregister = async function () {
      if (!('serviceWorker' in navigator)) return console.warn('No serviceWorker support');
      const regs = await navigator.serviceWorker.getRegistrations();
      if (!regs.length) return console.log('No registrations to unregister');
      console.log('Unregistering', regs.length, 'workers...');
      await Promise.all(regs.map(r => r.unregister()));
      console.log('Unregistered all service workers.');
    };

    window.debugSongsLoader_doUnregisterAndReload = async function () {
      await window.debugSongsLoader_doUnregister();
      console.log('Reloading page...');
      location.reload();
    };

    console.groupEnd();
  } catch (err) {
    console.error('debugSongsLoader error', err);
  }
})();
