import { materialControlsMarkup } from './material-controls.js';
import { lightingControlsMarkup } from './lighting-controls.js';
import { infoControlsMarkup } from './info-controls.js';
import { meshFields } from './mesh-settings.js';
import { instrumentControlsMarkup, bindInstrumentControls } from './instrument-controls.js';

const icon = path => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;
const paths = {
  pause: 'M8 5v14M16 5v14', play: 'm8 5 11 7-11 7Z',
  restart: 'M3 4v6h6M3 10a8 8 0 1 1 2 8',
  save: 'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12l4 4v12a2 2 0 0 1-2 2ZM7 3v6h10V3M7 21v-8h10v8',
  reload: 'M20 7v5h-5M20 12a8 8 0 1 0-2.3 5.7M20 7v5l-5-5',
};

function fieldMarkup(group, [key, label, initial, min, max, step]) {
  const id = `${group}-${key}`, data = `data-group="${group}" data-key="${key}"`;
  if (typeof initial === 'boolean') return `<label class="lighting-toggle"><input id="${id}" ${data} type="checkbox">${label}</label>`;
  if (typeof initial === 'string') return `<label class="color-label" for="${id}">${label}<output></output><input id="${id}" ${data} type="color"></label>`;
  if (group === 'camera' || group === 'infoLayout' || (group === 'pipeline' && key === 'seed')) return `<label for="${id}">${label}<input id="${id}" ${data} type="number" min="${min}" max="${max}" step="${step}"></label>`;
  return `<label class="slider-label" for="${id}">${label}<output></output></label><input id="${id}" ${data} type="range" min="${min}" max="${max}" step="${step}">`;
}

export function meshControlsMarkup() {
  const fields = group => meshFields[group].map(field => fieldMarkup(group, field)).join('');
  const saveLabel = import.meta.env?.PROD ? 'Save on this device' : 'Save settings';
  const tabs = ['Mesh', 'Motion', 'Audio', 'Materials', 'Lighting', 'Camera', 'Info'];
  return `
    <button class="icon-button drawer-toggle" aria-label="Open controls" title="Open controls" aria-expanded="false" aria-controls="controls-drawer">
      ${icon('m6 6 12 12M18 6 6 18')}
    </button>
    <aside id="controls-drawer" class="control-panel" aria-label="Sketch controls" hidden>
      <div class="drawer-header"><div class="panel-toolbar">
        <button class="icon-button run" aria-label="Pause" title="Pause">${icon(paths.pause)}</button>
        <button class="icon-button restart" aria-label="Regenerate mesh" title="Regenerate mesh">${icon(paths.restart)}</button>
        <button class="icon-button save-setup" aria-label="${saveLabel}" title="${saveLabel}">${icon(paths.save)}</button>
        <button class="icon-button reload-setup" aria-label="Reload saved settings" title="Reload saved settings">${icon(paths.reload)}</button>
      </div></div>
      <label class="fps-toggle"><input id="visibility-fps" data-group="visibility" data-key="fps" type="checkbox">Show frame-rate meter</label>
      <div class="control-tabs" role="tablist" aria-label="Control sections">
        ${tabs.map((name, i) => `<button id="tab-${name.toLowerCase()}" role="tab" aria-controls="panel-${name.toLowerCase()}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">${name}</button>`).join('')}
      </div>
      <div class="drawer-content">
        <p class="setup-status" role="status" aria-live="polite">Loading settings…</p>
        <fieldset class="panel-body">
          <section id="panel-mesh" role="tabpanel" aria-labelledby="tab-mesh">
            <p class="control-heading">Dodecahedron</p>${fields('mesh')}
            <p class="camera-hint">The starting mesh has twelve pentagonal faces. Radius sets its size; the existing operation layers build the pieces around it.</p>
            <details class="material-group" open><summary>Operation layers</summary>
              <p class="camera-hint">Toggle each pass below; enabled passes run in numbered order. Average vertices runs after the face-center dual and before inset, using connected neighbors while keeping boundary vertices fixed. Border descendants can be excluded from inset and extrusion. Smoothing also keeps the boundary fixed. The final dual clears selection.</p>
              ${meshFields.pipeline.filter(([key]) => key !== 'seed').map(field => fieldMarkup('pipeline', field)).join('')}
              <p class="camera-hint">Maximum chains limits the extruded pieces to 1–32, spread around the body; other faces stay in the base. Each piece uses floor(extrusion amount) segments, with a minimum of one. Extrusion length per segment sets their length: total depth = segment count × segment length.</p>
              <div class="camera-controls">${fieldMarkup('pipeline', meshFields.pipeline.find(([key]) => key === 'seed'))}</div>
              <button type="button" data-mesh-action="randomize">New variation</button>
              <p class="camera-hint">Triangulate before Hexelate splits the current faces with seeded random diagonals. The face-center dual forms polygon cells, mostly with five to seven sides. The final Average vertices pass relaxes them while keeping the boundary fixed. Disable triangulation to take the direct dual of the previous pass. Mesh wireframe shows the polygon edges.</p>
              <p class="layer-stats camera-hint"></p>
              <p class="face-sides camera-hint"></p>
            </details>
            <p class="control-heading">Faces</p>
            <p class="camera-hint">Drag a piece to pull its bone chain. Drag empty space to orbit. Shift-click a face to toggle selection; when paused, click selects faces. Selected edges are amber.</p>
            <div class="field-actions"><button type="button" data-mesh-action="selectAll">Select all</button><button type="button" data-mesh-action="clearSelection">Clear selection</button></div>
            <p class="face-selection-status" role="status">No faces selected</p>
            ${fields('editing')}
            <div class="field-actions"><button type="button" data-mesh-action="triangulate">Triangulate faces</button><button type="button" data-mesh-action="undo" disabled>Undo</button></div>
            <p class="control-heading">Dual mesh</p>
            <div class="field-actions"><button type="button" data-mesh-action="dualDiamond">Diamond</button><button type="button" data-mesh-action="dualNSided">Face-center dual</button></div>
            <p class="camera-hint">Dual operations replace the whole mesh. Diamond creates a quad across each shared edge; open boundaries keep triangles. Face-center dual joins face centers around each original vertex, closing boundary cells along the original outline.</p>
            <details class="material-group" open><summary>Extrude faces</summary>
              <p class="camera-hint">Each face uses its own center: X follows its first edge, Y lies in its plane, and Z follows its normal. Scale, rotate, then move the new cap in that local frame.</p>
              ${fields('extrusion')}
              <button type="button" data-mesh-action="extrude">Extrude faces</button>
            </details>
            <p class="camera-hint">Triangulate and Extrude affect all faces unless Only selected faces is checked. Resize, radius changes, Reload, and Restart rebuild the operation layers and clear manual edits. Save retains layer and transform controls.</p>
            <p class="control-heading">Show</p><div class="visibility-controls">
              ${meshFields.visibility.filter(([key]) => key !== 'fps').map(field => fieldMarkup('visibility', field)).join('')}
            </div><p class="mesh-stats"></p>
          </section>
          <section id="panel-motion" role="tabpanel" aria-labelledby="tab-motion" hidden>
            <details class="material-group" open><summary>Bones &amp; colliders</summary>
              <p class="camera-hint">Each piece has one collider and bone per extrusion segment. Segment count and length come from the Mesh tab. Roots attach to the movable central body with cone-limited joints. Drag a piece to lift and move the whole form; drag empty space to orbit. Hover repels colliders, even with outlines hidden. Resizing or changing mesh layers rebuilds the rig.</p>
              ${meshFields.rig.filter(([key]) => !key.startsWith('note')).map(field => fieldMarkup('rig', field)).join('')}
              <p class="camera-hint">Joint overlap puts each shared joint half a radius inside each neighboring capsule. At 1× their overlap is one radius; the base and tip keep their original positions.</p>
              <button type="button" data-mesh-action="nudgeRig">Nudge bone chains</button>
              <p class="rig-stats camera-hint"></p>
            </details>
            <details class="material-group" open><summary>Music response</summary>
              <p class="camera-hint">Bass gets the largest 33% of chains (rounded to a whole chain). The remaining instruments share the rest evenly, ordered by register. Each note drives every chain in its instrument group. Note pushes lift and sway the pieces, with roots attached to the body; their strength is independent of note scaling.</p>
              <p class="camera-hint">Minimum bone scale sets the resting size; maximum sets the peak for a full-strength low note. Zero minimum collapses the chains between notes. These are per-bone scales: each multiplies the scale inherited from its parent. Low notes go to the largest chains; high notes go to the smallest. Note weight influence varies their peak sizes. Attack controls expansion speed; release controls the return to minimum.</p>
              ${meshFields.rig.filter(([key]) => key.startsWith('note')).map(field => fieldMarkup('rig', field)).join('')}
              <p class="chain-note-stats camera-hint"></p>
            </details>
          </section>
          <section id="panel-audio" role="tabpanel" aria-labelledby="tab-audio" hidden>
            <p class="control-heading">Strudel</p>${fields('audio')}
            <p class="camera-hint">Look No Further · generative study. 82 BPM, rounded sliding bass, dry drums, wiry guitar and a breathy low voice. The guitar enters after the opening groove; the voice enters with the low bass section. Enable audio to listen.</p>
            <p class="camera-hint">While a piece is held, random notes from these instruments replace the song. Release to return to the song at its current position. Note density controls the intensity of the improvisation; instrument levels and effects still apply.</p>
            <p class="camera-hint march-audio-status" role="status">Composition ready · enable audio to listen.</p>
            <p class="control-heading">Instruments</p>
            <p class="camera-hint">Guitar / high instruments and Voice / lead each have their own sound, decay, filter, distortion, reverb and delay controls below. Their notes drive smaller chains; bass notes drive larger ones. Save retains the sound and motion settings.</p>
            ${instrumentControlsMarkup()}
          </section>
          <section id="panel-materials" role="tabpanel" aria-labelledby="tab-materials" hidden>
            <p class="control-heading">Wireframe overlay</p>${fields('appearance')}
            <details class="material-group" open><summary>Tile floor</summary>${fields('floor')}<p class="camera-hint">Tile depth recesses the grout and adds beveled edges that catch the light. Zero gives a seamless ground plane. Increase roughness for a softer tile finish.</p></details>
            ${materialControlsMarkup()}
          </section>
          <section id="panel-lighting" role="tabpanel" aria-labelledby="tab-lighting" hidden>
            ${lightingControlsMarkup().replaceAll('boxes', 'mesh')}
            <details class="material-group" open><summary>Fog</summary>${fields('fog')}<p class="camera-hint">Fades distant surfaces into the fog color, even with the lights off. Start and end distances are measured from the camera.</p></details>
          </section>
          <section id="panel-camera" role="tabpanel" aria-labelledby="tab-camera" hidden>
            <p class="control-heading">Camera</p><p class="camera-hint">Drag empty space to orbit; scroll or pinch to zoom. Follow uses the mesh center. Offsets are relative to that center with Follow on, or world coordinates with Follow off. Your view and Follow setting are saved.</p>
            ${meshFields.camera.filter(([, , value]) => typeof value === 'boolean').map(field => fieldMarkup('camera', field)).join('')}<div class="camera-controls">${meshFields.camera.filter(([, , value]) => typeof value !== 'boolean').map(field => fieldMarkup('camera', field)).join('')}</div><button class="reset-camera">Reset camera</button>
          </section>
          <section id="panel-info" role="tabpanel" aria-labelledby="tab-info" hidden>
            <p class="control-heading">Tile placement</p><div class="camera-controls">${fields('infoLayout')}</div>
            <p class="camera-hint">The square frame spans whole tiles. Column and row place its upper-left corner on the floor grid. Placement follows the tile size and is included when you save settings.</p>
            ${infoControlsMarkup()}
          </section>
        </fieldset>
      </div>
    </aside>`;
}

export function bindMeshControls(shell, { ui, change, playPause, reset, resetCamera, save, load, meshAction }) {
  const query = selector => shell.querySelector(selector);
  const drawer = query('.control-panel'), toggle = query('.drawer-toggle');
  toggle.hidden = !ui; toggle.disabled = !ui; drawer.inert = !ui;
  function toggleDrawer(open) {
    if (!ui) return;
    drawer.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.title = open ? 'Close controls' : 'Open controls';
    toggle.setAttribute('aria-label', toggle.title);
    (open ? drawer.querySelector('button') : toggle).focus({ preventScroll: true });
  }
  toggle.addEventListener('click', () => toggleDrawer(drawer.hidden));
  const keydown = event => {
    if (event.key === 'Escape' && !drawer.hidden) { toggleDrawer(false); event.preventDefault(); }
  };
  document.addEventListener('keydown', keydown);
  const tabs = [...shell.querySelectorAll('[role="tab"]')];
  function selectTab(tab) {
    for (const item of tabs) {
      const active = item === tab;
      item.setAttribute('aria-selected', String(active)); item.tabIndex = active ? 0 : -1;
      query(`#${item.getAttribute('aria-controls')}`).hidden = !active;
    }
    query('.drawer-content').scrollTop = 0;
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectTab(tab));
    tab.addEventListener('keydown', event => {
      const next = event.key === 'ArrowRight' ? tabs[(index + 1) % tabs.length]
        : event.key === 'ArrowLeft' ? tabs[(index + tabs.length - 1) % tabs.length]
          : event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs.at(-1) : undefined;
      if (next) { event.preventDefault(); selectTab(next); next.focus({ preventScroll: true }); }
    });
  });
  for (const button of shell.querySelectorAll('[data-mesh-action]')) button.addEventListener('click', () => meshAction(button.dataset.meshAction));
  const inputs = [...shell.querySelectorAll('input[data-group]')];
  const instruments = bindInstrumentControls(shell, change);
  for (const input of inputs) input.addEventListener('input', () => {
    if (!input.checkValidity() || input.value === '') return;
    const value = input.type === 'checkbox' ? input.checked : input.type === 'color' ? input.value : Number(input.value);
    change({ [input.dataset.group]: { [input.dataset.key]: value } });
  });
  for (const [selector, action] of [['.run', playPause], ['.restart', reset], ['.reset-camera', resetCamera]])
    query(selector).addEventListener('click', action);
  query('.save-setup').addEventListener('click', () => save().catch(() => {}));
  query('.reload-setup').addEventListener('click', () => load().catch(() => {}));
  return {
    set(settings, onlyGroup) {
      if (!onlyGroup || onlyGroup === 'audio') instruments.set(settings.audio.instruments);
      if (!onlyGroup || onlyGroup === 'fog') {
        query('#fog-near').max = (settings.fog.far - 0.1).toFixed(1);
        query('#fog-far').min = (settings.fog.near + 0.1).toFixed(1);
      }
      for (const input of inputs) {
        const { group, key } = input.dataset;
        if (onlyGroup && group !== onlyGroup) continue;
        const value = settings[group][key];
        if (input.type === 'checkbox') input.checked = value;
        else if (document.activeElement !== input) input.value = typeof value === 'number' ? Number(value.toFixed(input.type === 'number' ? 2 : 4)) : value;
        const output = query(`label[for="${input.id}"] output`);
        if (output) output.value = typeof value === 'number' ? String(Number(value.toFixed(3))) : value;
      }
    },
    editing({ selected, faces, canUndo, layers = [], faceSides = {}, rig }) {
      query('.layer-stats').textContent = layers.map(stage => `${stage.name}: ${stage.faces} faces`).join(' · ');
      query('.face-sides').textContent = `Final polygons · ${Object.entries(faceSides).sort(([a], [b]) => Number(a) - Number(b)).map(([sides, count]) => `${count} with ${sides} sides`).join(' · ')}`;
      query('.rig-stats').textContent = rig ? `${rig.chains} body-rooted chains · ${rig.bones} bones · ${rig.joints} cone joints · ${rig.colliders} piece colliders · ${rig.baseColliders} ground plane` : 'No active rig. Enable extrusion and binding, or regenerate after manual edits.';
      const names={bass:'Bass',keys:'Guitar',melody:'Voice',kick:'Kick',snare:'Snare',hat:'Hats'};
      query('.chain-note-stats').textContent = rig ? Object.entries(rig.noteGroups??{}).map(([layer,count])=>`${names[layer]??layer}: ${count} chains`).join(' · ') : '';
      query('.face-selection-status').textContent = `${selected} / ${faces} faces selected`;
      query('[data-mesh-action="undo"]').disabled = !canUndo;
    },
    status(message, error = false) { const el = query('.setup-status'); el.textContent = message; el.dataset.error = String(error); },
    busy(value) {
      query('.panel-body').disabled = value; query('#visibility-fps').disabled = value;
      query('.save-setup').disabled = value; query('.reload-setup').disabled = value;
    },
    running(value) { const button = query('.run'), label = value ? 'Pause' : 'Play'; button.title = label; button.setAttribute('aria-label', label); button.innerHTML = icon(paths[value ? 'pause' : 'play']); },
    stats(message) { query('.mesh-stats').textContent = message; },
    dispose() { document.removeEventListener('keydown', keydown); },
  };
}
