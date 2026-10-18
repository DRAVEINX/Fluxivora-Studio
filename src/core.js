(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FluxCore = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const VERSION = '0.5.0-beta.6';
  const DEFAULT_WIDTH = 1200;
  const DEFAULT_HEIGHT = 800;
  const OBJECT_TYPES = new Set(['rect', 'ellipse', 'line', 'text', 'image', 'stroke', 'path', 'bezier', 'polygon']);
  const DEFAULT_FILL = '#8b7cff';
  const DEFAULT_STROKE = '#d9d5ff';

  function createProject(workspace = 'pixel', name = 'Naamloos ontwerp') {
    const safeWorkspace = ['pixel', 'vector', 'layout'].includes(workspace) ? workspace : 'pixel';
    const safeName = cleanText(name, 80) || 'Naamloos ontwerp';
    const now = new Date().toISOString();
    return {
      format: 'fluxivora-project',
      version: VERSION,
      name: safeName,
      workspace: safeWorkspace,
      createdAt: now,
      updatedAt: now,
      pixel: { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT, baseImage: null, brightness: 100, contrast: 100, saturation: 100, objects: [] },
      vector: { width: 1000, height: 700, objects: [] },
      layout: { width: 794, height: 1123, pageFormat: 'a4-portrait', currentPage: 0, pages: [{ width: 794, height: 1123, name: 'Pagina 1', objects: [] }] }
    };
  }

  const DEFAULT_HISTORY_LIMIT = 60;
  const MAX_HISTORY_LIMIT = 1000;

  function cloneHistorySnapshot(project) {
    if (!project || typeof project !== 'object' || Array.isArray(project)) return null;
    try { return JSON.parse(JSON.stringify(project)); } catch (_) { return null; }
  }

  function safeHistoryLimit(limit) {
    return Number.isInteger(limit) && limit > 0 ? Math.min(limit, MAX_HISTORY_LIMIT) : DEFAULT_HISTORY_LIMIT;
  }

  function trimHistory(stack, limit) {
    if (stack.length > limit) stack.splice(0, stack.length - limit);
  }

  function recordProjectHistory(undoStack, redoStack, project, limit = DEFAULT_HISTORY_LIMIT) {
    if (!Array.isArray(undoStack) || !Array.isArray(redoStack)) return false;
    const snapshot = cloneHistorySnapshot(project);
    if (!snapshot) return false;
    const cap = safeHistoryLimit(limit);
    undoStack.push(snapshot);
    trimHistory(undoStack, cap);
    redoStack.length = 0;
    return true;
  }

  function recordProjectHistoryIfChanged(undoStack, redoStack, beforeProject, currentProject, limit = DEFAULT_HISTORY_LIMIT) {
    if (!Array.isArray(undoStack) || !Array.isArray(redoStack)) return false;
    const before = cloneHistorySnapshot(beforeProject);
    const current = cloneHistorySnapshot(currentProject);
    if (!before || !current || JSON.stringify(before) === JSON.stringify(current)) return false;
    return recordProjectHistory(undoStack, redoStack, before, limit);
  }

  function undoProjectHistory(undoStack, redoStack, currentProject, limit = DEFAULT_HISTORY_LIMIT) {
    if (!Array.isArray(undoStack) || !Array.isArray(redoStack) || undoStack.length === 0) return null;
    const previous = undoStack[undoStack.length - 1];
    if (!previous || typeof previous !== 'object' || Array.isArray(previous)) return null;
    const current = cloneHistorySnapshot(currentProject);
    if (!current) return null;
    undoStack.pop();
    redoStack.push(current);
    trimHistory(redoStack, safeHistoryLimit(limit));
    return previous;
  }

  function redoProjectHistory(undoStack, redoStack, currentProject, limit = DEFAULT_HISTORY_LIMIT) {
    if (!Array.isArray(undoStack) || !Array.isArray(redoStack) || redoStack.length === 0) return null;
    const next = redoStack[redoStack.length - 1];
    if (!next || typeof next !== 'object' || Array.isArray(next)) return null;
    const current = cloneHistorySnapshot(currentProject);
    if (!current) return null;
    redoStack.pop();
    undoStack.push(current);
    trimHistory(undoStack, safeHistoryLimit(limit));
    return next;
  }

  function resolveSelectionId(objects, selectedId) {
    if (!selectedId || !Array.isArray(objects)) return null;
    return objects.some(object => object && object.id === selectedId) ? selectedId : null;
  }

  function normaliseProject(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Dit projectbestand bevat geen geldig project.');
    if (input.format !== 'fluxivora-project') throw new Error('Dit is geen Fluxivora-projectbestand.');

    const project = createProject(input.workspace || 'pixel', input.name || 'Naamloos ontwerp');
    for (const key of ['createdAt', 'updatedAt']) {
      if (typeof input[key] === 'string' && input[key].length <= 80) project[key] = input[key];
    }
    project.version = VERSION;

    if (input.pixel && typeof input.pixel === 'object' && !Array.isArray(input.pixel)) {
      project.pixel.width = safeNumber(input.pixel.width, DEFAULT_WIDTH, 100, 6000);
      project.pixel.height = safeNumber(input.pixel.height, DEFAULT_HEIGHT, 100, 6000);
      project.pixel.brightness = safeNumber(input.pixel.brightness, 100, 0, 200);
      project.pixel.contrast = safeNumber(input.pixel.contrast, 100, 0, 200);
      project.pixel.saturation = safeNumber(input.pixel.saturation, 100, 0, 200);
      project.pixel.baseImage = safeImageDataUrl(input.pixel.baseImage) ? input.pixel.baseImage : null;
      project.pixel.objects = normaliseObjects(input.pixel.objects);
    }

    if (input.vector && typeof input.vector === 'object' && !Array.isArray(input.vector)) {
      project.vector.width = safeNumber(input.vector.width, 1000, 100, 6000);
      project.vector.height = safeNumber(input.vector.height, 700, 100, 6000);
      project.vector.objects = normaliseObjects(input.vector.objects);
    }

    if (input.layout && typeof input.layout === 'object' && !Array.isArray(input.layout)) {
      project.layout.width = safeNumber(input.layout.width, 794, 100, 6000);
      project.layout.height = safeNumber(input.layout.height, 1123, 100, 6000);
      project.layout.pageFormat = ['a4-portrait', 'a4-landscape', 'a5-portrait', 'letter-portrait'].includes(input.layout.pageFormat) ? input.layout.pageFormat : 'a4-portrait';
      const suppliedPages = Array.isArray(input.layout.pages) ? input.layout.pages : [];
      project.layout.pages = suppliedPages.slice(0, 500).map((page, index) => {
        const source = page && typeof page === 'object' && !Array.isArray(page) ? page : {};
        const width = safeNumber(source.width, project.layout.width, 100, 6000);
        const height = safeNumber(source.height, project.layout.height, 100, 6000);
        return {
          width,
          height,
          name: cleanText(source.name, 80) || `Pagina ${index + 1}`,
          objects: normaliseObjects(source.objects)
        };
      });
      if (project.layout.pages.length === 0) {
        project.layout.pages = [{ width: project.layout.width, height: project.layout.height, name: 'Pagina 1', objects: [] }];
      }
      project.layout.currentPage = Math.floor(safeNumber(input.layout.currentPage, 0, 0, project.layout.pages.length - 1));
    }

    if (!['pixel', 'vector', 'layout'].includes(project.workspace)) project.workspace = 'pixel';
    return project;
  }

  function normaliseObjects(items) {
    if (items == null) return [];
    if (!Array.isArray(items)) throw new Error('Een objectenlijst in dit project is ongeldig.');
    if (items.length > 100000) throw new Error('Dit project bevat meer dan 100.000 objecten in één werkruimte.');
    const usedIds = new Set();
    return items.map((item, index) => normaliseObject(item, index, usedIds));
  }

  function normaliseObject(input, index, usedIds) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error(`Object ${index + 1} in dit project is ongeldig.`);
    if (!OBJECT_TYPES.has(input.type)) throw new Error(`Object ${index + 1} heeft een niet-ondersteund type.`);

    let id = typeof input.id === 'string' && /^[a-z0-9_-]{1,80}$/i.test(input.id) && !usedIds.has(input.id) ? input.id : `obj_import_${index + 1}`;
    let suffix = 1;
    while (usedIds.has(id)) id = `obj_import_${index + 1}_${suffix++}`;
    usedIds.add(id);

    const obj = makeObject(
      input.type,
      safeNumber(input.x, 0),
      safeNumber(input.y, 0),
      safeNumber(input.w, 0, 0, 10000000),
      safeNumber(input.h, 0, 0, 10000000),
      {
        id,
        fill: safePaint(input.fill, DEFAULT_FILL),
        stroke: safePaint(input.stroke, DEFAULT_STROKE),
        strokeWidth: safeNumber(input.strokeWidth, 2, 0, 500),
        radius: safeNumber(input.radius, 0, 0, 10000000),
        opacity: safeNumber(input.opacity, 1, 0, 1),
        text: cleanText(input.text, 100000),
        fontSize: safeNumber(input.fontSize, 32, 6, 1000),
        fontFamily: safeFontFamily(input.fontFamily),
        mode: input.mode === 'erase' ? 'erase' : 'paint',
        points: Array.isArray(input.points)
          ? input.points.slice(0, input.type === 'polygon' ? 1000 : 100000).filter(point => point && typeof point === 'object').map(point => {
            const normalPoint = { x: safeNumber(point.x, 0), y: safeNumber(point.y, 0) };
            for (const handleName of ['inHandle', 'outHandle']) {
              const handle = point[handleName];
              if (handle && typeof handle === 'object') normalPoint[handleName] = { x: safeNumber(handle.x, normalPoint.x), y: safeNumber(handle.y, normalPoint.y) };
            }
            return normalPoint;
          })
          : [],
        polygonKind: safePolygonKind(input.polygonKind),
        dataUrl: safeImageDataUrl(input.dataUrl) ? input.dataUrl : null,
        visible: input.visible !== false,
        locked: input.locked === true,
        rotation: safeNumber(input.rotation, 0, -360000, 360000)
      }
    );
    if (obj.type === 'line') {
      obj.fill = 'none';
    }
    return obj;
  }

  function makeObject(type, x, y, w = 0, h = 0, props = {}) {
    return {
      id: typeof props.id === 'string' && /^[a-z0-9_-]{1,80}$/i.test(props.id) ? props.id : makeId(),
      type: OBJECT_TYPES.has(type) ? type : 'rect',
      x: safeNumber(x, 0), y: safeNumber(y, 0), w: safeNumber(w, 0), h: safeNumber(h, 0),
      fill: safePaint(props.fill, DEFAULT_FILL),
      stroke: safePaint(props.stroke, DEFAULT_STROKE),
      strokeWidth: safeNumber(props.strokeWidth, 2, 0, 500),
      opacity: safeNumber(props.opacity, 1, 0, 1),
      text: cleanText(props.text ?? (type === 'text' ? 'Jouw tekst' : ''), 100000),
      fontSize: safeNumber(props.fontSize, 32, 6, 1000),
      fontFamily: safeFontFamily(props.fontFamily),
      mode: props.mode === 'erase' ? 'erase' : 'paint',
      radius: safeNumber(props.radius, 0, 0, 10000000),
      points: Array.isArray(props.points) ? props.points.slice(0, type === 'polygon' ? 1000 : 100000).map(p => { const point = { x: safeNumber(p?.x, 0), y: safeNumber(p?.y, 0) }; for (const name of ['inHandle', 'outHandle']) if (p?.[name] && typeof p[name] === 'object') point[name] = { x: safeNumber(p[name].x, point.x), y: safeNumber(p[name].y, point.y) }; return point; }) : [],
      polygonKind: safePolygonKind(props.polygonKind),
      dataUrl: safeImageDataUrl(props.dataUrl) ? props.dataUrl : null,
      visible: props.visible !== false,
      locked: props.locked === true,
      rotation: safeNumber(props.rotation, 0, -360000, 360000)
    };
  }

  function safePolygonKind(value) {
    return ['triangle', 'star', 'pentagon', 'hexagon', 'diamond', 'arrow', 'octagon', 'speech'].includes(value) ? value : 'triangle';
  }

  function polygonPoints(kind, x, y, w, h) {
    const left = safeNumber(x, 0), top = safeNumber(y, 0);
    const width = Math.max(0, safeNumber(w, 0)), height = Math.max(0, safeNumber(h, 0));
    const right = left + width, bottom = top + height;
    const cx = left + width / 2, cy = top + height / 2;
    const safeKind = safePolygonKind(kind);
    if (safeKind === 'star') {
      const outerX = width / 2, outerY = height / 2;
      return Array.from({ length: 10 }, (_, index) => {
        const angle = -Math.PI / 2 + index * Math.PI / 5;
        const radius = index % 2 === 0 ? 1 : 0.42;
        return { x: round(cx + Math.cos(angle) * outerX * radius), y: round(cy + Math.sin(angle) * outerY * radius) };
      });
    }
    if (safeKind === 'diamond') return [
      { x: round(cx), y: top }, { x: right, y: round(cy) },
      { x: round(cx), y: bottom }, { x: left, y: round(cy) }
    ];
    if (safeKind === 'arrow') return [
      { x: left, y: round(top + height * 0.25) },
      { x: round(left + width * 0.56), y: round(top + height * 0.25) },
      { x: round(left + width * 0.56), y: top },
      { x: right, y: round(cy) },
      { x: round(left + width * 0.56), y: bottom },
      { x: round(left + width * 0.56), y: round(top + height * 0.75) },
      { x: left, y: round(top + height * 0.75) }
    ];
    if (safeKind === 'speech') return [
      { x: round(left + width * 0.08), y: top },
      { x: round(left + width * 0.92), y: top },
      { x: right, y: round(top + height * 0.18) },
      { x: right, y: round(top + height * 0.66) },
      { x: round(left + width * 0.58), y: round(top + height * 0.66) },
      { x: round(left + width * 0.42), y: bottom },
      { x: round(left + width * 0.4), y: round(top + height * 0.66) },
      { x: left, y: round(top + height * 0.66) },
      { x: left, y: round(top + height * 0.18) }
    ];
    const sides = { pentagon: 5, hexagon: 6, octagon: 8 }[safeKind];
    if (sides) return Array.from({ length: sides }, (_, index) => {
      const angle = -Math.PI / 2 + index * Math.PI * 2 / sides;
      return { x: round(cx + Math.cos(angle) * width / 2), y: round(cy + Math.sin(angle) * height / 2) };
    });
    return [
      { x: round(cx), y: top },
      { x: right, y: bottom },
      { x: left, y: bottom }
    ];
  }

  function resizeObject(input, width, height, options = {}) {
    if (!input || typeof input !== 'object' || !OBJECT_TYPES.has(input.type)) throw new Error('Dit object kan niet worden geschaald.');
    if (input.locked === true) return null;
    const obj = JSON.parse(JSON.stringify(input));
    const w = safeNumber(width, obj.w, 0, 10000000);
    const h = safeNumber(height, obj.h, 0, 10000000);
    const keepAspect = options.keepAspect === true && Math.abs(obj.w) > 0.001 && Math.abs(obj.h) > 0.001;
    if (keepAspect) {
      const ratio = Math.abs(obj.w / obj.h);
      if (options.anchor === 'width') { obj.w = w; obj.h = round(w / ratio); }
      else if (options.anchor === 'height') { obj.h = h; obj.w = round(h * ratio); }
      else if (Math.abs(w - obj.w) >= Math.abs(h - obj.h)) { obj.w = w; obj.h = round(w / ratio); }
      else { obj.h = h; obj.w = round(h * ratio); }
    } else {
      obj.w = w;
      obj.h = h;
    }
    if (Array.isArray(obj.points) && obj.points.length && Math.abs(input.w) > 0.001 && Math.abs(input.h) > 0.001) {
      const sx = obj.w / input.w, sy = obj.h / input.h;
      const transformPoint = point => ({
        x: round(obj.x + (safeNumber(point?.x, input.x) - input.x) * sx),
        y: round(obj.y + (safeNumber(point?.y, input.y) - input.y) * sy)
      });
      obj.points = obj.points.map(point => {
        const resizedPoint = transformPoint(point);
        for (const handleName of ['inHandle', 'outHandle']) {
          if (point?.[handleName] && typeof point[handleName] === 'object') {
            resizedPoint[handleName] = transformPoint(point[handleName]);
          }
        }
        return resizedPoint;
      });
    }
    return obj;
  }

  function rotateObject(input, degrees) {
    if (!input || typeof input !== 'object' || !OBJECT_TYPES.has(input.type)) throw new Error('Dit object kan niet worden gedraaid.');
    if (input.locked === true) return null;
    const obj = JSON.parse(JSON.stringify(input));
    obj.rotation = round((((safeNumber(input.rotation, 0) + safeNumber(degrees, 0, -360000, 360000)) % 360) + 360) % 360);
    return obj;
  }

  function makeId() {
    return `obj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
  }

  function duplicateObject(input, offset = 20) {
    if (!input || typeof input !== 'object' || !OBJECT_TYPES.has(input.type)) throw new Error('Dit object kan niet worden gedupliceerd.');
    const copy = JSON.parse(JSON.stringify(input));
    copy.id = makeId();
    const shift = safeNumber(offset, 20, -10000, 10000);
    copy.x = safeNumber(copy.x, 0) + shift;
    copy.y = safeNumber(copy.y, 0) + shift;
    if (Array.isArray(copy.points)) copy.points = copy.points.map(point => {
      const shifted = { x: safeNumber(point?.x, 0) + shift, y: safeNumber(point?.y, 0) + shift };
      for (const name of ['inHandle', 'outHandle']) if (point?.[name] && typeof point[name] === 'object') shifted[name] = { x: safeNumber(point[name].x, shifted.x - shift) + shift, y: safeNumber(point[name].y, shifted.y - shift) + shift };
      return shifted;
    });
    return copy;
  }

  function moveObject(objects, objectId, delta) {
    if (!Array.isArray(objects) || typeof objectId !== 'string') return false;
    const index = objects.findIndex(object => object && object.id === objectId);
    const distance = Math.trunc(safeNumber(delta, 0, -1000000, 1000000));
    const target = index + distance;
    if (index < 0 || distance === 0 || target < 0 || target >= objects.length) return false;
    [objects[index], objects[target]] = [objects[target], objects[index]];
    return true;
  }

  function setObjectFlag(objects, objectId, flag, value) {
    if (!Array.isArray(objects) || !['visible', 'locked'].includes(flag)) return false;
    const object = objects.find(item => item && item.id === objectId);
    if (!object) return false;
    object[flag] = Boolean(value);
    return true;
  }

  function safeNumber(value, fallback = 0, min = -10000000, max = 10000000) {
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return round(Math.max(min, Math.min(max, parsed)));
  }

  function round(value) { return Math.round((Number(value) || 0) * 100) / 100; }
  function cleanText(value, maxLength = 100000) { return String(value ?? '').slice(0, maxLength); }

  function safePaint(value, fallback = DEFAULT_FILL) {
    const paint = String(value ?? '').trim();
    if (/^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(paint)) return paint;
    if (/^(?:none|transparent|black|white|red|green|blue|yellow|orange|purple|gray|grey|silver|navy|teal|lime|aqua|fuchsia|maroon|olive|currentColor)$/i.test(paint)) return paint;
    if (/^(?:rgb|rgba|hsl|hsla)\([0-9.%+\-,\s/degturnrad]+\)$/i.test(paint)) return paint;
    return fallback;
  }

  function safeFontFamily(value) {
    const family = String(value ?? 'Inter, Segoe UI, sans-serif').trim();
    return /^[a-z0-9 _,\-'".]{1,120}$/i.test(family) ? family : 'Inter, Segoe UI, sans-serif';
  }

  function safeImageDataUrl(value) {
    if (typeof value !== 'string' || value.length > 80 * 1024 * 1024) return false;
    return /^data:image\/(?:png|jpeg|webp|bmp|gif);base64,[a-z0-9+/]+={0,2}$/i.test(value);
  }

  function xml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function bezierSegmentHandles(points, index) {
    const safe = Array.isArray(points) ? points : [];
    const p1 = safe[index], p2 = safe[index + 1];
    if (!p1 || !p2) return null;
    const p0 = safe[Math.max(0, index - 1)] || p1;
    const p3 = safe[Math.min(safe.length - 1, index + 2)] || p2;
    const out = p1.outHandle && Number.isFinite(p1.outHandle.x) && Number.isFinite(p1.outHandle.y)
      ? { x: safeNumber(p1.outHandle.x, p1.x), y: safeNumber(p1.outHandle.y, p1.y) }
      : { x: round(p1.x + (p2.x - p0.x) / 6), y: round(p1.y + (p2.y - p0.y) / 6) };
    const incoming = p2.inHandle && Number.isFinite(p2.inHandle.x) && Number.isFinite(p2.inHandle.y)
      ? { x: safeNumber(p2.inHandle.x, p2.x), y: safeNumber(p2.inHandle.y, p2.y) }
      : { x: round(p2.x - (p3.x - p1.x) / 6), y: round(p2.y - (p3.y - p1.y) / 6) };
    return { out, in: incoming };
  }

  function splitBezierSegment(points, index, t = 0.5) {
    if (!Array.isArray(points) || !Number.isInteger(index) || index < 0 || index >= points.length - 1) return null;
    const amount = safeNumber(t, 0.5, 0.01, 0.99);
    const clone = points.map(point => {
      const copy = { x: safeNumber(point?.x, 0), y: safeNumber(point?.y, 0) };
      for (const name of ['inHandle', 'outHandle']) if (point?.[name]) copy[name] = { x: safeNumber(point[name].x, copy.x), y: safeNumber(point[name].y, copy.y) };
      return copy;
    });
    const start = clone[index], end = clone[index + 1];
    const handles = bezierSegmentHandles(clone, index);
    const lerp = (a, b) => ({ x: round(a.x + (b.x - a.x) * amount), y: round(a.y + (b.y - a.y) * amount) });
    const a = lerp(start, handles.out);
    const b = lerp(handles.out, handles.in);
    const c = lerp(handles.in, end);
    const d = lerp(a, b);
    const e = lerp(b, c);
    const mid = lerp(d, e);
    // Store explicit controls so splitting preserves the original cubic segment exactly.
    start.outHandle = a;
    end.inHandle = c;
    const inserted = { ...mid, inHandle: d, outHandle: e };
    clone.splice(index + 1, 0, inserted);
    return { points: clone, index: index + 1 };
  }

  function deleteBezierAnchor(points, index) {
    if (!Array.isArray(points) || points.length <= 2 || !Number.isInteger(index) || index < 0 || index >= points.length) return null;
    const clone = points.map(point => {
      const copy = { x: safeNumber(point?.x, 0), y: safeNumber(point?.y, 0) };
      for (const name of ['inHandle', 'outHandle']) if (point?.[name]) copy[name] = { x: safeNumber(point[name].x, copy.x), y: safeNumber(point[name].y, copy.y) };
      return copy;
    });
    clone.splice(index, 1);
    return clone;
  }

  function smoothPathData(points) {
    const safe = (Array.isArray(points) ? points : []).slice(0, 100000).map(p => {
      const point = { x: safeNumber(p?.x, 0), y: safeNumber(p?.y, 0) };
      for (const handleName of ['inHandle', 'outHandle']) {
        if (p?.[handleName] && typeof p[handleName] === 'object') point[handleName] = {
          x: safeNumber(p[handleName].x, point.x), y: safeNumber(p[handleName].y, point.y)
        };
      }
      return point;
    });
    if (!safe.length) return '';
    if (safe.length === 1) return `M ${safe[0].x} ${safe[0].y}`;
    let d = `M ${safe[0].x} ${safe[0].y}`;
    for (let i = 0; i < safe.length - 1; i++) {
      const handles = bezierSegmentHandles(safe, i);
      d += ` C ${handles.out.x} ${handles.out.y}, ${handles.in.x} ${handles.in.y}, ${safe[i + 1].x} ${safe[i + 1].y}`;
    }
    return d;
  }

  function objectToSvg(obj) {
    if (!obj || typeof obj !== 'object' || !OBJECT_TYPES.has(obj.type) || obj.visible === false) return '';
    const x = safeNumber(obj.x, 0), y = safeNumber(obj.y, 0);
    const w = safeNumber(obj.w, 0, 0, 10000000), h = safeNumber(obj.h, 0, 0, 10000000);
    const opacity = safeNumber(obj.opacity, 1, 0, 1);
    const strokeWidth = safeNumber(obj.strokeWidth, 2, 0, 500);
    const fill = safePaint(obj.fill, DEFAULT_FILL);
    const stroke = safePaint(obj.stroke, DEFAULT_STROKE);
    const rotation = safeNumber(obj.rotation, 0, -360000, 360000);
    const transform = rotation ? ` transform="rotate(${rotation} ${x + w / 2} ${y + h / 2})"` : '';
    const common = `opacity="${opacity}"${transform}`;

    if (obj.type === 'rect') return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${safeNumber(obj.radius, 0, 0, 10000000)}" fill="${xml(fill)}" stroke="${xml(stroke)}" stroke-width="${strokeWidth}" ${common}/>`;
    if (obj.type === 'ellipse') return `<ellipse cx="${x + w / 2}" cy="${y + h / 2}" rx="${Math.abs(w / 2)}" ry="${Math.abs(h / 2)}" fill="${xml(fill)}" stroke="${xml(stroke)}" stroke-width="${strokeWidth}" ${common}/>`;
    if (obj.type === 'line') return `<line x1="${x}" y1="${y}" x2="${x + w}" y2="${y + h}" stroke="${xml(stroke)}" stroke-width="${strokeWidth || 2}" ${common}/>`;
    if (obj.type === 'polygon') {
      const points = (Array.isArray(obj.points) && obj.points.length >= 3 ? obj.points : polygonPoints(obj.polygonKind, x, y, w, h))
        .slice(0, 1000).map(p => `${safeNumber(p?.x, 0)} ${safeNumber(p?.y, 0)}`).join(' ');
      if (!points) return '';
      return `<polygon points="${points}" fill="${xml(fill)}" stroke="${xml(stroke)}" stroke-width="${strokeWidth}" stroke-linejoin="round" ${common}/>`;
    }
    if (obj.type === 'path' || obj.type === 'stroke' || obj.type === 'bezier') {
      const points = Array.isArray(obj.points) ? obj.points.slice(0, 100000) : [];
      const d = obj.type === 'bezier' ? smoothPathData(points) : points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${safeNumber(p?.x, 0)} ${safeNumber(p?.y, 0)}`).join(' ');
      if (obj.mode === 'erase' || !d) return '';
      return `<path d="${d}" fill="none" stroke="${xml(stroke === 'none' ? fill : stroke)}" stroke-width="${strokeWidth || 3}" stroke-linecap="round" stroke-linejoin="round" ${common}/>`;
    }
    if (obj.type === 'text') {
      const fontSize = safeNumber(obj.fontSize, 32, 6, 1000);
      return `<text x="${x}" y="${y + fontSize}" fill="${xml(fill)}" font-size="${fontSize}" font-family="${xml(safeFontFamily(obj.fontFamily))}" ${common}>${xml(obj.text || '')}</text>`;
    }
    if (obj.type === 'image' && safeImageDataUrl(obj.dataUrl)) {
      return `<image x="${x}" y="${y}" width="${Math.max(1, w)}" height="${Math.max(1, h)}" preserveAspectRatio="xMidYMid meet" href="${xml(obj.dataUrl)}" ${common}/>`;
    }
    return '';
  }

  function serializeSvg(width, height, objects, options = {}) {
    const w = safeNumber(width, 1000, 1, 1000000);
    const h = safeNumber(height, 700, 1, 1000000);
    const backgroundValue = options.background ? safePaint(options.background, '#ffffff') : null;
    const bg = backgroundValue ? `<rect width="100%" height="100%" fill="${xml(backgroundValue)}"/>` : '';
    const body = (Array.isArray(objects) ? objects : []).map(objectToSvg).join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${bg}${body}</svg>`;
  }

  return { VERSION, DEFAULT_WIDTH, DEFAULT_HEIGHT, createProject, normaliseProject, normaliseObject, makeObject, duplicateObject, moveObject, setObjectFlag, resizeObject, rotateObject, polygonPoints, bezierSegmentHandles, splitBezierSegment, deleteBezierAnchor, smoothPathData, objectToSvg, serializeSvg, xml, safeImageDataUrl, recordProjectHistory, recordProjectHistoryIfChanged, undoProjectHistory, redoProjectHistory, resolveSelectionId };
});
