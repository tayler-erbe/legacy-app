/**
 * End-to-end browser test for Legacy.
 *
 *   python3 -m http.server 8765        # from the repo root, in another terminal
 *   node tests/e2e.js
 *
 * Needs Playwright with Chromium, plus Python 3 with Pillow (to generate test
 * photos with EXIF data). Screenshots and downloads go to a fresh temp folder,
 * whose path is printed at the end.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const SP = fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-e2e-'));
const BASE = process.env.LEGACY_URL || 'http://localhost:8765/';
execFileSync('python3', ['-I', path.join(__dirname, 'genphotos.py'), path.join(SP, 'camroll')]);
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('dialog', d => d.accept());
  const toastText = async () => { await page.waitForTimeout(200); return page.textContent('#toast'); };
  const assert = (c, msg) => { if (!c) { console.log('FAIL', msg); process.exitCode = 1; } else console.log('ok  ', msg); };
  const countStore = (s) => page.evaluate((s) => new Promise(r => { const q = indexedDB.open('legacy_memories'); q.onsuccess = () => { const g = q.result.transaction(s).objectStore(s).count(); g.onsuccess = () => { q.result.close(); r(g.result); }; }; }), s);

  await page.goto(BASE);
  await page.click('#welcomeCta');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  fs.writeFileSync(SP + '/p.png', png);

  const newMemory = async () => { await page.click('#fab'); await page.waitForTimeout(450); await page.click('#guideSkip'); await page.waitForTimeout(150); };

  // 1: guided start -> category -> prompt; approximate date; unflushed tags; photo
  await page.click('#fab'); await page.waitForTimeout(450);
  assert(await page.isVisible('#guideStep'), 'guide shows on new memory');
  assert(!(await page.isVisible('#saveBtn')), 'save hidden during guide');
  await page.click('.guide-tile:has-text("A story about me")'); await page.waitForTimeout(200);
  assert((await page.$$('.guide-prompt')).length >= 5, 'category shows prompt list');
  const prompt = (await page.textContent('.guide-prompt')).trim();
  await page.click('.guide-prompt >> nth=0'); await page.waitForTimeout(200);
  assert(await page.isVisible('#formStep') && await page.isVisible('#saveBtn'), 'form shows after picking prompt');
  assert(await page.isVisible('#promptPinned'), 'prompt pinned');
  await page.setInputFiles('#photoInput', SP + '/p.png');
  assert(await page.isVisible('#removePhotoBtn'), 'remove-photo visible after picking');
  await page.fill('#dateInput', '1987-06-15');
  await page.check('#dateApproxInput');
  await page.fill('#storyInput', 'We drove to the lake in the blue Buick.');
  await page.fill('#peopleInput', 'Grandma Rose'); await page.click('#addPersonBtn');
  await page.fill('#tagInput', 'Lake, Summer');
  await page.click('#saveBtn');
  assert((await toastText()) === 'Memory saved', 'toast says saved');
  const card = await page.textContent('.memory-card');
  assert(card.includes('Around June 1987'), 'approximate date shown');
  assert(card.includes(prompt), 'title falls back to prompt');
  assert(card.toLowerCase().includes('lake') && card.toLowerCase().includes('summer'), 'unflushed tags saved');

  // 2: on-this-day memory
  const d = new Date(); const md = `${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  await newMemory();
  await page.fill('#titleInput', 'First apartment');
  await page.fill('#dateInput', `2001-${md}`);
  await page.click('#saveBtn'); await page.waitForTimeout(300);
  assert(await page.isVisible('#onThisDay'), 'on this day shows');
  assert((await page.textContent('#onThisDay')).includes(`${d.getFullYear()-2001} years ago`), 'on this day years-ago label');

  // 3: edit -> toast says updated, remove photo
  await page.click('.memory-card:has-text("Buick")'); await page.waitForTimeout(450);
  await page.click('#editBtn'); await page.waitForTimeout(800);
  assert(!(await page.isVisible('#guideStep')), 'no guide while editing');
  assert(await page.isVisible('#promptPinned'), 'prompt still pinned while editing');
  assert(await page.isChecked('#dateApproxInput'), 'approx checkbox restored on edit');
  await page.click('#removePhotoBtn');
  await page.click('#saveBtn');
  assert((await toastText()) === 'Memory updated', 'toast says updated (bug fix)');
  assert((await countStore('images')) === 0, 'image blob deleted after removal');

  // 4: search
  await page.fill('#searchInput', 'buick'); await page.waitForTimeout(300);
  assert((await page.$$('.memory-card')).length === 1, 'search filters to 1');
  assert((await page.textContent('#memoryCount')) === '1 of 2', 'count shows 1 of 2');
  await page.fill('#searchInput', 'zzzz'); await page.waitForTimeout(300);
  assert(await page.isVisible('.empty-search'), 'no-match state');
  await page.click('#clearSearchEmpty'); await page.waitForTimeout(200);
  assert((await page.$$('.memory-card')).length === 2, 'clear restores list');

  // 5: tag link in detail -> filter
  await page.click('.memory-card:has-text("Buick")'); await page.waitForTimeout(450);
  await page.click('.tag-link:has-text("Grandma Rose")'); await page.waitForTimeout(400);
  assert((await page.inputValue('#searchInput')) === 'Grandma Rose', 'tag click sets search');
  assert((await page.$$('.memory-card')).length === 1, 'tag filter result');
  await page.click('#searchClear'); await page.waitForTimeout(200);

  // 6: backup banner after 5 memories (first filler gets a photo for the archive round trip)
  for (let i = 0; i < 3; i++) {
    await newMemory();
    await page.fill('#titleInput', 'Filler ' + i);
    if (i === 0) await page.setInputFiles('#photoInput', SP + '/p.png');
    await page.click('#saveBtn'); await page.waitForTimeout(300);
  }
  assert(await page.isVisible('#backupBanner'), 'backup banner at 5 unbacked');
  await page.screenshot({ path: SP + '/list.png' });

  // 7: export -> zip archive
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#backupBannerBtn')]);
  const out = SP + '/archive.zip'; await dl.saveAs(out);
  assert(/^legacy-archive-\d{4}-\d{2}-\d{2}\.zip$/.test(dl.suggestedFilename()), 'zip filename');
  const zinfo = JSON.parse(execFileSync('python3', ['-I', '-c', [
    'import zipfile, json, sys',
    'z = zipfile.ZipFile(sys.argv[1]); bad = z.testzip(); names = z.namelist()',
    'm = [n for n in names if n.endswith("memories.json")][0]',
    'print(json.dumps({"bad": bad, "names": names, "manifest": json.loads(z.read(m))}))',
  ].join('\n'), out]).toString());
  assert(zinfo.bad === null, 'zip CRCs verify with python zipfile');
  assert(zinfo.names.some(n => n.endsWith('/index.html')) && zinfo.names.some(n => n.endsWith('/README.txt')), 'zip has book + readme');
  assert(zinfo.names.some(n => /\/images\/mem_.*\.png$/.test(n)), 'zip has image file with extension');
  assert(zinfo.manifest.memories.length === 5 && zinfo.manifest.schema_version === '2.1', 'manifest has 5 memories v2.1');
  await page.waitForTimeout(300);
  assert(!(await page.isVisible('#backupBanner')), 'banner hides after export');

  // 7b: the offline book renders from disk with media (fresh folder per run)
  const bookDir = SP + '/book-' + Date.now();
  execFileSync('python3', ['-I', '-c', 'import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])', out, bookDir]);
  const folder = fs.readdirSync(bookDir)[0];
  const bookPage = await ctx.newPage();
  await bookPage.goto('file://' + bookDir + '/' + folder + '/index.html');
  assert((await bookPage.$$('article.memory')).length === 5, 'book shows 5 memories offline');
  assert((await bookPage.textContent('body')).includes('Buick'), 'book contains story text');
  const imgOk = await bookPage.$eval('article.memory img', i => i.complete && i.naturalWidth > 0);
  assert(imgOk, 'book image loads from images/ folder');
  await bookPage.screenshot({ path: SP + '/book.png' });
  await bookPage.close();

  // 8: wipe + restore from zip
  await page.evaluate(() => new Promise(r => { const q = indexedDB.open('legacy_memories'); q.onsuccess = () => { const tx = q.result.transaction(['memories','images','audio'], 'readwrite'); ['memories','images','audio'].forEach(s => tx.objectStore(s).clear()); tx.oncomplete = () => { q.result.close(); r(); }; }; }));
  await page.reload(); await page.waitForTimeout(500);
  assert((await page.textContent('#memoryCount')) === '0', 'wiped');
  await page.click('#settingsBtn'); await page.waitForTimeout(450);
  await page.setInputFiles('#importInput', out); await page.waitForTimeout(900);
  const t = await page.textContent('#toast');
  assert(t.includes('5 added'), 'zip restore toast: ' + t);
  await page.setInputFiles('#importInput', out); await page.waitForTimeout(900);
  assert((await page.textContent('#toast')).includes('5 already here'), 'second restore is idempotent');
  await page.keyboard.press('Escape'); await page.waitForTimeout(450);
  assert(!(await page.isVisible('#settingsModal.open')), 'escape closes settings');
  assert((await page.$$('.memory-card img')).length === 1, 'zip-restored image renders');
  assert((await page.textContent('.memory-card:has-text("Buick")')).includes('Around June 1987'), 'approx survives round trip');

  // 8b: legacy v1.2 JSON backups still restore (with inline image)
  const legacyJson = { schema_version: '1.2', memories: [{ id: 'mem_old_1', title: 'Old JSON memory', story: 'from before', created: 1, updated: 2, hasImage: true, imageData: 'data:image/png;base64,' + png.toString('base64') }] };
  fs.writeFileSync(SP + '/old.json', JSON.stringify(legacyJson));
  await page.click('#settingsBtn'); await page.waitForTimeout(450);
  await page.setInputFiles('#importInput', SP + '/old.json'); await page.waitForTimeout(700);
  assert((await page.textContent('#toast')).includes('1 added'), 'legacy JSON restores');
  await page.keyboard.press('Escape'); await page.waitForTimeout(450);
  assert((await page.$$('.memory-card:has-text("Old JSON memory") img')).length === 1, 'legacy JSON image renders');

  // 9: bad file
  fs.writeFileSync(SP + '/bad.json', '{"nope":1}');
  await page.click('#settingsBtn'); await page.waitForTimeout(450);
  await page.setInputFiles('#importInput', SP + '/bad.json'); await page.waitForTimeout(400);
  assert((await page.textContent('#toast')).includes("isn't a Legacy archive"), 'bad file rejected');

  // 9b: legacy plan saves + letter + reminder
  await page.fill('#nameInput', 'Linda');
  await page.fill('#planRecipients', 'Sarah and Michael');
  await page.fill('#planLocation', 'Google Drive folder Legacy');
  await page.check('input[name="planAi"][value="grounded"]');
  await page.click('#printLetterBtn'); await page.waitForTimeout(300);
  assert((await page.textContent('#printLetter')).includes('Google Drive folder Legacy'), 'letter includes backup location');
  await page.emulateMedia({ media: 'print' });
  await page.evaluate(() => document.body.classList.add('printing'));
  await page.screenshot({ path: SP + '/letter.png' });
  await page.evaluate(() => document.body.classList.remove('printing'));
  await page.emulateMedia({ media: 'screen' });
  await page.click('#saveSettings'); await page.waitForTimeout(400);
  await page.click('#settingsBtn'); await page.waitForTimeout(450);
  assert(await page.isChecked('input[name="planAi"][value="grounded"]'), 'plan persisted');
  const [ics] = await Promise.all([page.waitForEvent('download'), page.click('#reminderBtn')]);
  await ics.saveAs(SP + '/r.ics');
  const icsText = fs.readFileSync(SP + '/r.ics', 'utf8');
  assert(icsText.includes('RRULE:FREQ=WEEKLY') && icsText.includes('\r\n'), 'weekly .ics with CRLF');
  await page.keyboard.press('Escape'); await page.waitForTimeout(450);

  // 9c: ask-me composer (family member's side)
  const fam = await ctx.newPage();
  fam.on('dialog', d => d.accept());
  fam.on('pageerror', e => errors.push('fam pageerror: ' + e.message));
  await fam.goto(BASE + '?askme=Linda'); await fam.waitForTimeout(500);
  assert(await fam.isVisible('#askBackdrop.open'), 'composer opens from askme link');
  assert(!(await fam.isVisible('#welcomeBackdrop.open')), 'no welcome over composer');
  assert((await fam.textContent('#askTitle')).includes('Linda'), 'composer names the storyteller');
  await fam.screenshot({ path: SP + '/ask.png' });
  await fam.fill('#askQuestion', 'How did you meet Dad?');
  await fam.fill('#askFrom', 'Sarah');
  await fam.click('#askSend'); await fam.waitForTimeout(400);
  const askUrl = await fam.inputValue('#askLink');
  assert(askUrl.includes('ask=') && askUrl.includes('from=Sarah'), 'ask link built: ' + askUrl);
  await fam.close();

  // 9d: storyteller opens the ask link
  await page.goto(askUrl); await page.waitForTimeout(900);
  assert(await page.isVisible('#addModal.open'), 'ask link opens new memory');
  const pinnedText = await page.textContent('#promptPinned');
  assert(pinnedText.includes('Sarah asked') && pinnedText.includes('How did you meet Dad?'), 'question pinned with asker');
  assert(!page.url().includes('ask='), 'url cleaned');
  await page.click('#cancelBtn'); await page.waitForTimeout(450);
  assert(await page.isVisible('#askBanner'), 'question banner waits in list');
  await page.screenshot({ path: SP + '/askbanner.png' });
  await page.click('#askBannerBtn'); await page.waitForTimeout(600);
  await page.fill('#storyInput', 'At a dance in 1972.');
  await page.click('#saveBtn'); await page.waitForTimeout(500);
  assert(!(await page.isVisible('#askBanner')), 'banner clears once answered');
  await page.click('.memory-card:has-text("1972")'); await page.waitForTimeout(450);
  assert((await page.textContent('.detail-prompt')).includes('Asked by Sarah'), 'detail credits the asker');
  await page.keyboard.press('Escape'); await page.waitForTimeout(450);

  // 12: photos — import a camera roll, group into moments
  const roll = fs.readdirSync(SP + '/camroll').map(f => SP + '/camroll/' + f);
  await page.click('.nav-item[data-tab="photos"]'); await page.waitForTimeout(300);
  await page.setInputFiles('#photoImportInput', roll); await page.waitForTimeout(2500);
  assert((await page.textContent('#toast')).includes('15 photos added'), 'imported 15: ' + await page.textContent('#toast'));
  const titles = await page.$$eval('.bucket-title', els => els.map(e => e.textContent));
  assert((await page.textContent('#bucketCount')) === '5', 'five moments: ' + titles.join(' | '));
  assert(titles.some(t => t.includes('A trip') && t.includes('Jul 4') && t.includes('2023')), 'Paris trip detected');
  assert(titles.some(t => t.includes('March 10, 2024')), 'home day detected');
  const tripSub = await page.textContent('.bucket-card:has-text("A trip") .bucket-sub');
  assert(/about \d+ km from home/.test(tripSub) && tripSub.includes('5 photos'), 'trip subtitle: ' + tripSub);
  assert((await page.textContent('.bucket-card:has-text("date estimated")')).includes('1 photo'), 'no-EXIF photo marked estimated');
  assert((await page.textContent('#photosBadge')) === '5', 'nav badge counts moments');
  await page.screenshot({ path: SP + '/photos.png' });
  await page.setInputFiles('#photoImportInput', roll); await page.waitForTimeout(1500);
  assert((await page.textContent('#toast')).includes('15 already here'), 're-import dedupes');

  // 12b: on this day surfaces the photo moment from two years ago
  await page.click('.nav-item[data-tab="memories"]'); await page.waitForTimeout(300);
  assert((await page.textContent('#onThisDay')).includes('Would you like to tell this story?'), 'on-this-day offers photo moment');

  // 12c: tell the trip's story: captions, remove one, follow-ups, family
  await page.click('.nav-item[data-tab="photos"]'); await page.waitForTimeout(300);
  await page.click('.bucket-card:has-text("A trip") .bucket-tell'); await page.waitForTimeout(700);
  assert(await page.isVisible('#formStep'), 'bucket opens form directly');
  assert((await page.$$('.gallery-item')).length === 5, 'gallery has trip photos');
  assert((await page.inputValue('#dateInput')) === '2023-07-04', 'date from photos');
  await page.fill('.gallery-caption >> nth=0', 'That is our dog in the background, the day we brought her home.');
  await page.click('.gallery-remove >> nth=4'); await page.waitForTimeout(300);
  assert((await page.$$('.gallery-item')).length === 4, 'photo removed from memory');
  assert(await page.isVisible('#followGroup'), 'follow-ups offered for photo stories');
  await page.fill('#storyInput', 'Our first trip abroad together. It rained every single afternoon and we did not care.');
  await page.fill('.follow-a >> nth=0', 'Just the two of us, and a very wet umbrella.');
  await page.click('#followMore'); await page.waitForTimeout(150);
  assert((await page.$$('.follow-item')).length === 3, 'ask me something else adds a question');
  await page.click('.segmented label:has-text("Family")');
  await page.screenshot({ path: SP + '/tripform.png' });
  await page.click('#saveBtn'); await page.waitForTimeout(1200);
  assert((await page.textContent('#toast')) === 'Memory saved', 'trip memory saved');
  const leftover = await page.$$eval('.bucket-card', els => els.map(e => e.textContent));
  assert(leftover.some(t => t.includes('A day away') && t.includes('1 photo')), 'removed photo returns to inbox');
  await page.click('.nav-item[data-tab="memories"]'); await page.waitForTimeout(400);
  await page.fill('#searchInput', 'umbrella'); await page.waitForTimeout(400);
  assert((await page.$$('.memory-card')).length === 1, 'search finds follow-up answers');
  assert((await page.$$('.memory-card img')).length === 1, 'card cover comes from gallery');
  await page.click('.memory-card'); await page.waitForTimeout(600);
  assert((await page.$$('.detail-photo')).length === 4, 'detail shows gallery');
  assert((await page.textContent('.detail-gallery')).includes('our dog in the background'), 'detail shows caption');
  assert((await page.textContent('.detail-follow')).includes('wet umbrella'), 'detail shows follow-up');
  assert((await page.textContent('.detail-footnote')).includes('Family'), 'detail shows visibility');
  await page.screenshot({ path: SP + '/tripdetail.png', fullPage: false });
  await page.keyboard.press('Escape'); await page.waitForTimeout(450);
  await page.click('#searchClear'); await page.waitForTimeout(200);

  // 12d: "Not now" sets a moment aside, and it can come back
  await page.click('.nav-item[data-tab="photos"]'); await page.waitForTimeout(300);
  const before = +(await page.textContent('#bucketCount'));
  await page.click('.bucket-card:has-text("May 1, 2024") .bucket-hide'); await page.waitForTimeout(300);
  assert(+(await page.textContent('#bucketCount')) === before - 1, 'not now hides a moment');
  await page.click('#bucketHiddenToggle'); await page.waitForTimeout(300);
  assert(await page.isVisible('.bucket-card.is-dismissed'), 'set-aside moments can be shown');
  await page.click('#bucketHiddenToggle'); await page.waitForTimeout(200);

  // 13: someone specific: recipient -> prompts with their name -> form defaults
  await page.click('.nav-item[data-tab="memories"]'); await page.waitForTimeout(300);
  await page.click('#fab'); await page.waitForTimeout(450);
  assert(await page.isVisible('.guide-tile-photos'), 'guide offers photo moments');
  await page.click('.guide-tile:has-text("Someone specific")'); await page.waitForTimeout(200);
  await page.fill('#guideRecipient', 'Sarah'); await page.click('#guideRecipientGo'); await page.waitForTimeout(200);
  const hard = await page.$$eval('.guide-prompt', els => els.map(e => e.textContent));
  assert(hard.some(t => t.includes('Sarah') && t.includes('too hard')), 'prompts use the name');
  await page.screenshot({ path: SP + '/guide-someone.png' });
  await page.click('.guide-prompt:has-text("too hard")'); await page.waitForTimeout(200);
  assert(await page.isVisible('#forGroup') && (await page.inputValue('#recipientInput')) === 'Sarah', 'for field prefilled');
  assert(await page.isChecked('input[name="visibility"][value="family"]'), 'messages default to family');
  await page.fill('#occasionInput', 'On a hard day');
  await page.fill('#storyInput', 'You are stronger than you think. Call your brother.');
  await page.click('#saveBtn'); await page.waitForTimeout(600);
  assert((await page.textContent('.memory-card:has-text("Call your brother")')).includes('For Sarah'), 'card shows recipient');

  // 14: family edition leaves out "Just me" memories, questions and locations
  await page.click('#settingsBtn'); await page.waitForTimeout(450);
  const [fdl] = await Promise.all([page.waitForEvent('download'), page.click('#familyExportBtn')]);
  const fz = SP + '/family.zip'; await fdl.saveAs(fz);
  assert(/^legacy-family-edition-/.test(fdl.suggestedFilename()), 'family edition filename');
  const fam2 = JSON.parse(execFileSync('python3', ['-I', '-c', [
    'import zipfile, json, sys',
    'z = zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; names = z.namelist()',
    'm = json.loads(z.read([n for n in names if n.endswith("memories.json")][0]))',
    'print(json.dumps({"names": names, "m": m}))',
  ].join('\n'), fz]).toString());
  const vis = fam2.m.memories.map(x => x.visibility);
  assert(vis.length >= 2 && vis.every(v => v === 'family' || v === 'public'), 'family edition has only shared memories: ' + vis.join(','));
  assert(fam2.m.questions.length === 0 && fam2.m.plan.backupLocation === '', 'family edition drops questions + backup location');
  const tripRec = fam2.m.memories.find(x => (x.photos || []).length === 4);
  assert(tripRec && tripRec.photos.every(p => p.lat === undefined) && fam2.names.filter(n => n.includes('/photos/')).length === 4, 'photos included without coordinates');
  // full archive keeps everything, and restores the gallery after a wipe
  const [full] = await Promise.all([page.waitForEvent('download'), page.click('#settingsExportBtn')]);
  const fullZip = SP + '/full2.zip'; await full.saveAs(fullZip);
  await page.keyboard.press('Escape'); await page.waitForTimeout(450);
  await page.evaluate(() => new Promise(r => { const q = indexedDB.open('legacy_memories'); q.onsuccess = () => { const tx = q.result.transaction(['memories','images','audio','photos'], 'readwrite'); ['memories','images','audio','photos'].forEach(s => tx.objectStore(s).clear()); tx.oncomplete = () => { q.result.close(); r(); }; }; }));
  await page.reload(); await page.waitForTimeout(600);
  await page.click('#settingsBtn'); await page.waitForTimeout(450);
  await page.setInputFiles('#importInput', fullZip); await page.waitForTimeout(2000);
  assert((await page.textContent('#toast')).includes('9 added'), 'full restore: ' + await page.textContent('#toast'));
  await page.keyboard.press('Escape'); await page.waitForTimeout(450);
  await page.click('.memory-card:has-text("rained")'); await page.waitForTimeout(700);
  assert((await page.$$('.detail-photo img')).length === 4 && (await page.textContent('.detail-gallery')).includes('our dog'), 'gallery + captions restored');
  await page.keyboard.press('Escape'); await page.waitForTimeout(450);

  // 10: screenshots
  await page.click('#fab'); await page.waitForTimeout(450);
  await page.screenshot({ path: SP + '/new.png' });
  await page.keyboard.press('Escape'); await page.waitForTimeout(450);

  // 11: offline reload via SW
  await page.reload(); await page.waitForTimeout(800);
  await ctx.setOffline(true);
  await page.reload(); await page.waitForTimeout(800);
  assert((await page.textContent('#memoryCount')) === '9', 'works offline after SW install');
  await ctx.setOffline(false);

  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors');
  console.log('artifacts in', SP);
  await browser.close();
})();
