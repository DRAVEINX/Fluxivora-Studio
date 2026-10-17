const test = require('node:test');
const assert = require('node:assert/strict');
const FluxCore = require('../src/core.js');

const validPngDataUrl = `data:image/png;base64,${Buffer.from('png-test').toString('base64')}`;

test('maakt één project met de drie werkruimtes aan', () => {
  const p = FluxCore.createProject('pixel', 'Test');
  assert.equal(p.format, 'fluxivora-project');
  assert.equal(p.version, '0.5.0-alpha.27');
  assert.equal(p.name, 'Test');
  assert.equal(p.pixel.objects.length, 0);
  assert.equal(p.vector.objects.length, 0);
  assert.equal(p.layout.pages.length, 1);
  assert.equal(p.vector.objects.length, 0);
});

test('normaliseert oudere projectbestanden en pagina’s', () => {
  const p = FluxCore.normaliseProject({
    format: 'fluxivora-project',
    version: '0.1.0',
    workspace: 'layout',
    layout: { pages: [{ objects: [{ type: 'text', text: 'Hallo', x: '10' }] }] }
  });
  assert.equal(p.workspace, 'layout');
  assert.equal(p.version, '0.5.0-alpha.27');
  assert.equal(p.layout.pages[0].objects[0].text, 'Hallo');
  assert.equal(p.layout.pages[0].objects[0].x, 10);
  assert.throws(() => FluxCore.normaliseProject({ format: 'onbekend' }), /geen Fluxivora-projectbestand/);
});

test('maakt geldige en ge-escape-te SVG-uitvoer', () => {
  const obj = FluxCore.makeObject('text', 30, 40, 0, 0, { text: '<Fluxivora & ontwerp>' });
  const svg = FluxCore.serializeSvg(800, 600, [obj]);
  assert.match(svg, /<svg xmlns=/);
  assert.match(svg, /&lt;Fluxivora &amp; ontwerp&gt;/);
  assert.match(svg, /width="800" height="600"/);
});

test('maakt consistente objectdefaults voor vectorvormen', () => {
  const shape = FluxCore.makeObject('rect', 10, 20, 30, 40);
  assert.equal(shape.type, 'rect');
  assert.equal(shape.x, 10);
  assert.equal(shape.w, 30);
  assert.equal(shape.opacity, 1);
  assert.ok(shape.id);
});

test('normaliseert ongeldige getallen, kleuren en lettertypes uit een project', () => {
  const project = FluxCore.normaliseProject({
    format: 'fluxivora-project',
    vector: { objects: [{ type: 'rect', x: '0" onload="alert(1)', w: -100, fill: 'url(javascript:alert(1))', fontFamily: 'evil;url(x)' }] }
  });
  const object = project.vector.objects[0];
  assert.equal(object.x, 0);
  assert.equal(object.w, 0);
  assert.equal(object.fill, '#8b7cff');
  assert.equal(object.fontFamily, 'Inter, Segoe UI, sans-serif');
  const svg = FluxCore.serializeSvg(project.vector.width, project.vector.height, project.vector.objects);
  assert.doesNotMatch(svg, /onload=/i);
  assert.doesNotMatch(svg, /javascript:/i);
});

test('weigert onbekende objecttypen in plaats van deze blind te renderen', () => {
  assert.throws(() => FluxCore.normaliseProject({
    format: 'fluxivora-project', vector: { objects: [{ type: 'foreign-element', x: 1 }] }
  }), /niet-ondersteund type/);
});

test('maakt object-ID’s uniek bij het normaliseren van een project', () => {
  const project = FluxCore.normaliseProject({
    format: 'fluxivora-project', vector: { objects: [
      { id: 'same', type: 'rect' }, { id: 'same', type: 'ellipse' }, { id: 'space id', type: 'line' }
    ] }
  });
  const ids = project.vector.objects.map(obj => obj.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every(id => /^[a-z0-9_-]+$/i.test(id)));
});

test('accepteert alleen ingesloten rasterafbeeldingen als data-URL', () => {
  assert.equal(FluxCore.safeImageDataUrl(validPngDataUrl), true);
  assert.equal(FluxCore.safeImageDataUrl('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='), false);
  assert.equal(FluxCore.safeImageDataUrl('javascript:alert(1)'), false);
});

test('serializeert ruwe ongeldige coördinaten als veilige numerieke waarden', () => {
  const svg = FluxCore.serializeSvg('800" onload="alert(1)', 600, [{
    type: 'rect', x: '1" onload="alert(1)', y: Infinity, w: 25, h: 30, fill: '#ffffff', stroke: '#000000'
  }]);
  assert.match(svg, /width="1000" height="600"/);
  assert.doesNotMatch(svg, /onload=/i);
  assert.match(svg, /x="0" y="0" width="25" height="30"/);
});

test('dupliceert een object met een nieuwe ID en offset voor coördinaten en paden', () => {
  const original = FluxCore.makeObject('path', 10, 20, 30, 40, { points: [{ x: 10, y: 20 }, { x: 40, y: 60 }] });
  const duplicate = FluxCore.duplicateObject(original, 20);
  assert.notEqual(duplicate.id, original.id);
  assert.equal(duplicate.x, 30);
  assert.equal(duplicate.y, 40);
  assert.deepEqual(duplicate.points, [{ x: 30, y: 40 }, { x: 60, y: 80 }]);
  assert.equal(original.points[0].x, 10, 'het origineel blijft ongewijzigd');
});

test('verandert de laagvolgorde zonder de inhoud van de objecten te wijzigen', () => {
  const objects = [
    FluxCore.makeObject('rect', 0, 0, 10, 10, { id: 'back' }),
    FluxCore.makeObject('ellipse', 10, 10, 10, 10, { id: 'middle' }),
    FluxCore.makeObject('text', 20, 20, 10, 10, { id: 'front' })
  ];
  assert.equal(FluxCore.moveObject(objects, 'middle', 1), true);
  assert.deepEqual(objects.map(object => object.id), ['back', 'front', 'middle']);
  assert.equal(FluxCore.moveObject(objects, 'back', -1), false);
  assert.equal(FluxCore.moveObject(objects, 'missing', 1), false);
});

test('clampet de huidige pagina naar een geldige gehele index', () => {
  const project = FluxCore.normaliseProject({
    format: 'fluxivora-project',
    layout: { pages: [{ name: 'A' }, { name: 'B' }, { name: 'C' }], currentPage: 1.8 }
  });
  assert.equal(project.layout.currentPage, 1);
  assert.ok(project.layout.pages[project.layout.currentPage]);
});


test('geeft bestaande en nieuwe objecten zichtbaarheid en vergrendeling', () => {
  const legacy = FluxCore.normaliseProject({ format: 'fluxivora-project', vector: { objects: [{ id: 'legacy', type: 'rect' }] } });
  assert.equal(legacy.vector.objects[0].visible, true);
  assert.equal(legacy.vector.objects[0].locked, false);
  const locked = FluxCore.normaliseProject({ format: 'fluxivora-project', vector: { objects: [{ id: 'locked', type: 'rect', visible: false, locked: true }] } });
  assert.equal(locked.vector.objects[0].visible, false);
  assert.equal(locked.vector.objects[0].locked, true);
});

test('stelt alleen toegestane laagvlaggen in', () => {
  const objects = [FluxCore.makeObject('rect', 0, 0, 10, 10, { id: 'layer-a' })];
  assert.equal(FluxCore.setObjectFlag(objects, 'layer-a', 'visible', false), true);
  assert.equal(objects[0].visible, false);
  assert.equal(FluxCore.setObjectFlag(objects, 'layer-a', 'locked', true), true);
  assert.equal(objects[0].locked, true);
  assert.equal(FluxCore.setObjectFlag(objects, 'layer-a', 'onclick', true), false);
  assert.equal(FluxCore.setObjectFlag(objects, 'missing', 'locked', true), false);
});

test('sluit verborgen objecten uit bij SVG-export maar behoudt vergrendelde objecten', () => {
  const visible = FluxCore.makeObject('rect', 1, 2, 3, 4, { id: 'visible' });
  const hidden = FluxCore.makeObject('ellipse', 5, 6, 7, 8, { id: 'hidden', visible: false });
  const locked = FluxCore.makeObject('text', 9, 10, 0, 0, { id: 'locked', locked: true, text: 'Beschermd' });
  const svg = FluxCore.serializeSvg(100, 100, [visible, hidden, locked]);
  assert.match(svg, /<rect x="1"/);
  assert.doesNotMatch(svg, /<ellipse/);
  assert.match(svg, /Beschermd/);
});

test('dupliceren bewaart zichtbaarheid en vergrendeling als metadata', () => {
  const original = FluxCore.makeObject('rect', 2, 3, 4, 5, { visible: false, locked: true });
  const copy = FluxCore.duplicateObject(original, 0);
  assert.equal(copy.visible, false);
  assert.equal(copy.locked, true);
  assert.notEqual(copy.id, original.id);
});


test('maakt betrouwbare driehoek- en sterpolygonen met correcte bounds', () => {
  const triangle = FluxCore.polygonPoints('triangle', 10, 20, 100, 80);
  assert.deepEqual(triangle, [{ x: 60, y: 20 }, { x: 110, y: 100 }, { x: 10, y: 100 }]);
  const star = FluxCore.polygonPoints('star', 0, 0, 100, 100);
  assert.equal(star.length, 10);
  assert.ok(star.every(point => Number.isFinite(point.x) && Number.isFinite(point.y)));
  assert.ok(star.every(point => point.x >= 0 && point.x <= 100 && point.y >= 0 && point.y <= 100));
});

test('normaliseert polygonen en bewaart hun soort bij project-opslag', () => {
  const project = FluxCore.normaliseProject({
    format: 'fluxivora-project',
    vector: { objects: [{ type: 'polygon', polygonKind: 'star', x: 20, y: 30, w: 90, h: 90, points: FluxCore.polygonPoints('star', 20, 30, 90, 90), fill: '#ffcc00' }] }
  });
  assert.equal(project.vector.objects[0].type, 'polygon');
  assert.equal(project.vector.objects[0].polygonKind, 'star');
  const roundTrip = FluxCore.normaliseProject(JSON.parse(JSON.stringify(project)));
  assert.equal(roundTrip.vector.objects[0].polygonKind, 'star');
  assert.equal(roundTrip.vector.objects[0].points.length, 10);
});

test('exporteert triangle- en star-objecten als veilige SVG-polygonen', () => {
  const triangle = FluxCore.makeObject('polygon', 10, 20, 100, 80, { id: 'safe-triangle', polygonKind: 'triangle', points: FluxCore.polygonPoints('triangle', 10, 20, 100, 80), fill: '#f0c000' });
  const star = FluxCore.makeObject('polygon', 30, 30, 80, 80, { id: 'safe-star', polygonKind: 'star', points: FluxCore.polygonPoints('star', 30, 30, 80, 80), fill: '#8b7cff' });
  const svg = FluxCore.serializeSvg(200, 160, [triangle, star]);
  assert.equal((svg.match(/<polygon /g) || []).length, 2);
  assert.match(svg, /points="60 20 110 100 10 100"/);
  assert.doesNotMatch(svg, /onload=|javascript:/i);
});

test('schaalt een object proportioneel wanneer aspectverhouding is ingeschakeld', () => {
  const Core = require('../src/core.js');
  const object = FluxCore.makeObject('rect', 10, 20, 100, 50);
  const resized = FluxCore.resizeObject(object, 200, 50, { keepAspect: true, anchor: 'width' });
  assert.equal(resized.w, 200);
  assert.equal(resized.h, 100);
  assert.equal(object.w, 100, 'origineel blijft onveranderd');
});

test('schalen van Bézier-curves behoudt en schaalt in- en uit-handgrepen', () => {
  const curve = FluxCore.makeObject('bezier', 10, 20, 100, 50, {
    points: [
      { x: 10, y: 20, outHandle: { x: 35, y: 30 } },
      { x: 110, y: 70, inHandle: { x: 85, y: 60 } }
    ]
  });
  const resized = FluxCore.resizeObject(curve, 200, 100);
  assert.deepEqual(resized.points, [
    { x: 10, y: 20, outHandle: { x: 60, y: 40 } },
    { x: 210, y: 120, inHandle: { x: 160, y: 100 } }
  ]);
  assert.deepEqual(curve.points[0].outHandle, { x: 35, y: 30 }, 'originele handgrepen blijven onveranderd');
});

test('roteert objecten met genormaliseerde graden en weigert vergrendelde objecten', () => {
  const Core = require('../src/core.js');
  const object = FluxCore.makeObject('rect', 0, 0, 40, 30);
  assert.equal(FluxCore.rotateObject(object, 450).rotation, 90);
  assert.equal(FluxCore.rotateObject({ ...object, locked: true }, 30), null);
});

test('SVG-export bevat rotatietransformatie voor geroteerde objecten', () => {
  const Core = require('../src/core.js');
  const object = { ...FluxCore.makeObject('rect', 10, 20, 100, 50), rotation: 30 };
  assert.match(FluxCore.objectToSvg(object), /transform="rotate\(30 60 45\)"/);
});

test('bewaart rotatie bij het normaliseren van een projectobject', () => {
  const project = FluxCore.normaliseProject({
    format: 'fluxivora-project',
    vector: { objects: [{ type: 'rect', x: 10, y: 20, w: 80, h: 40, rotation: 450 }] }
  });
  assert.equal(project.vector.objects[0].rotation, 450);
  const rotated = FluxCore.rotateObject(project.vector.objects[0], 10);
  assert.equal(rotated.rotation, 100);
});

test('normaliseert extreme rotatie-invoer en behoudt oude bestanden zonder rotatie', () => {
  const project = FluxCore.normaliseProject({
    format: 'fluxivora-project',
    vector: { objects: [{ type: 'rect', rotation: '999999999' }, { type: 'ellipse' }] }
  });
  assert.equal(project.vector.objects[0].rotation, 360000);
  assert.equal(project.vector.objects[1].rotation, 0);
});


test('Bézier-segment gebruikt standaardhandgrepen en bewaart aangepaste handgrepen', () => {
  const points = [{ x: 0, y: 0 }, { x: 60, y: 60 }, { x: 120, y: 0 }];
  const automatic = FluxCore.bezierSegmentHandles(points, 0);
  assert.deepEqual(automatic.out, { x: 10, y: 10 });
  assert.deepEqual(automatic.in, { x: 40, y: 60 });
  points[0].outHandle = { x: 15, y: 3 };
  const custom = FluxCore.bezierSegmentHandles(points, 0);
  assert.deepEqual(custom.out, { x: 15, y: 3 });
  assert.match(FluxCore.smoothPathData(points), /C 15 3, 40 60, 60 60/);
});

test('projectnormalisatie bewaart veilige Bézier-handgrepen', () => {
  const project = FluxCore.normaliseProject({ format: 'fluxivora-project', vector: { objects: [{ type: 'bezier', points: [
    { x: 10, y: 20, outHandle: { x: 30, y: 40 }, inHandle: { x: 'bad', y: 15 } }, { x: 80, y: 90 }
  ] }] } });
  assert.deepEqual(project.vector.objects[0].points[0].outHandle, { x: 30, y: 40 });
  assert.deepEqual(project.vector.objects[0].points[0].inHandle, { x: 10, y: 15 });
});


test('dupliceren verschuift Bézier-handgrepen samen met de ankerpunten', () => {
  const original = FluxCore.makeObject('bezier', 0, 0, 0, 0, { points: [{ x: 10, y: 20, outHandle: { x: 15, y: 25 } }, { x: 40, y: 50, inHandle: { x: 35, y: 45 } }] });
  const copy = FluxCore.duplicateObject(original, 20);
  assert.deepEqual(copy.points[0], { x: 30, y: 40, outHandle: { x: 35, y: 45 } });
  assert.deepEqual(copy.points[1], { x: 60, y: 70, inHandle: { x: 55, y: 65 } });
});

test('Bézier-segment splits with De Casteljau and preserves the original curve', () => {
  const points = [
    { x: 0, y: 0, outHandle: { x: 10, y: 40 } },
    { x: 100, y: 0, inHandle: { x: 80, y: 40 } }
  ];
  const split = FluxCore.splitBezierSegment(points, 0, 0.5);
  assert.ok(split);
  assert.equal(split.index, 1);
  assert.equal(split.points.length, 3);
  assert.deepEqual(split.points[1], { x: 46.25, y: 30, inHandle: { x: 25, y: 30 }, outHandle: { x: 67.5, y: 30 } });
  const cubic = (a, b, c, d, t) => {
    const u = 1 - t;
    return { x: u ** 3 * a.x + 3 * u ** 2 * t * b.x + 3 * u * t ** 2 * c.x + t ** 3 * d.x,
      y: u ** 3 * a.y + 3 * u ** 2 * t * b.y + 3 * u * t ** 2 * c.y + t ** 3 * d.y };
  };
  const original = t => cubic(points[0], points[0].outHandle, points[1].inHandle, points[1], t);
  const left = t => cubic(split.points[0], split.points[0].outHandle, split.points[1].inHandle, split.points[1], t);
  const right = t => cubic(split.points[1], split.points[1].outHandle, split.points[2].inHandle, split.points[2], t);
  for (const t of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
    const actual = t <= 0.5 ? left(t * 2) : right((t - 0.5) * 2);
    const expected = original(t);
    assert.ok(Math.abs(actual.x - expected.x) < 0.001);
    assert.ok(Math.abs(actual.y - expected.y) < 0.001);
  }
  assert.equal(FluxCore.splitBezierSegment(points, -1), null);
  assert.equal(FluxCore.splitBezierSegment(points, 1), null);
});

test('Bézier-anker verwijderen houdt minimaal twee punten over en kopieert data veilig', () => {
  const original = [
    { x: 0, y: 0, outHandle: { x: 5, y: 5 } },
    { x: 20, y: 30 },
    { x: 40, y: 0, inHandle: { x: 35, y: 5 } }
  ];
  const result = FluxCore.deleteBezierAnchor(original, 1);
  assert.equal(result.length, 2);
  assert.deepEqual(result[0], original[0]);
  assert.notEqual(result, original);
  assert.equal(FluxCore.deleteBezierAnchor(original, -1), null);
  assert.equal(FluxCore.deleteBezierAnchor(original.slice(0, 2), 0), null);
});

test('bewaart een ondersteund papierformaat en valt veilig terug bij onbekende waarden', () => {
  const project = FluxCore.createProject('layout');
  assert.equal(project.layout.pageFormat, 'a4-portrait');
  project.layout.pageFormat = 'a4-landscape';
  assert.equal(FluxCore.normaliseProject(project).layout.pageFormat, 'a4-landscape');
  project.layout.pageFormat = 'custom-executable';
  assert.equal(FluxCore.normaliseProject(project).layout.pageFormat, 'a4-portrait');
});


test('SVG-export behoudt documentafmetingen, viewBox en XML-veilige tekst', () => {
  const svg = FluxCore.serializeSvg(640, 480, [
    FluxCore.makeObject('text', 12, 20, 120, 40, { text: '<Logo & ontwerp>', fill: '#222222' })
  ]);
  assert.match(svg, /width="640" height="480" viewBox="0 0 640 480"/);
  assert.match(svg, /&lt;Logo &amp; ontwerp&gt;/);
  assert.doesNotMatch(svg, /<Logo & ontwerp>/);
});

test('roundtrip van opslaan en heropenen bewaart alle werkruimtes en projectdetails', () => {
  const project = FluxCore.createProject('layout', 'Rondreis');
  project.createdAt = '2026-10-01T10:00:00.000Z';
  project.updatedAt = '2026-10-17T18:00:00.000Z';
  project.workspace = 'layout';
  project.pixel.baseImage = validPngDataUrl;
  project.pixel.brightness = 125;
  project.pixel.objects.push(FluxCore.makeObject('stroke', 12, 18, 60, 40, {
    points: [{ x: 12, y: 18 }, { x: 30, y: 24 }, { x: 72, y: 58 }],
    stroke: '#123456', strokeWidth: 4, opacity: 0.75
  }));
  project.vector.objects.push(FluxCore.makeObject('bezier', 20, 30, 100, 80, {
    id: 'curve-persist',
    points: [
      { x: 20, y: 30, outHandle: { x: 55, y: 20 } },
      { x: 120, y: 110, inHandle: { x: 96, y: 100 } }
    ],
    visible: false, locked: true, rotation: 17
  }));
  project.layout.pageFormat = 'a4-landscape';
  project.layout.pages = [
    { width: 1123, height: 794, name: 'Omslag', objects: [FluxCore.makeObject('rect', 0, 0, 1123, 794, { fill: '#112233' })] },
    { width: 1123, height: 794, name: 'Inhoud', objects: [FluxCore.makeObject('text', 35, 45, 0, 0, { text: 'Bewaar deze tekst', fontSize: 28 })] }
  ];
  project.layout.currentPage = 1;

  const reopened = FluxCore.normaliseProject(JSON.parse(JSON.stringify(project)));

  assert.equal(reopened.name, 'Rondreis');
  assert.equal(reopened.workspace, 'layout');
  assert.equal(reopened.createdAt, project.createdAt);
  assert.equal(reopened.updatedAt, project.updatedAt);
  assert.equal(reopened.pixel.baseImage, validPngDataUrl);
  assert.equal(reopened.pixel.brightness, 125);
  assert.equal(reopened.pixel.objects[0].points.length, 3);
  assert.equal(reopened.vector.objects[0].visible, false);
  assert.equal(reopened.vector.objects[0].locked, true);
  assert.equal(reopened.vector.objects[0].rotation, 17);
  assert.deepEqual(reopened.vector.objects[0].points[0].outHandle, { x: 55, y: 20 });
  assert.equal(reopened.layout.pageFormat, 'a4-landscape');
  assert.equal(reopened.layout.currentPage, 1);
  assert.equal(reopened.layout.pages.length, 2);
  assert.equal(reopened.layout.pages[1].objects[0].text, 'Bewaar deze tekst');
});

test('beschadigde opslagdata wordt geweigerd in plaats van stilzwijgend als project gebruikt', () => {
  assert.throws(() => FluxCore.normaliseProject(JSON.parse('{kapot')), SyntaxError);
  assert.throws(() => FluxCore.normaliseProject({ format: 'anders', pixel: {} }), /geen Fluxivora-projectbestand/);
});


test('undo en redo herstellen onafhankelijke snapshots en wissen redo bij een nieuwe bewerking', () => {
  const undo = [], redo = [];
  const project = FluxCore.createProject('vector', 'Voor');
  project.vector.objects.push(FluxCore.makeObject('rect', 10, 20, 30, 40, { fill: '#112233' }));

  assert.equal(FluxCore.recordProjectHistory(undo, redo, project, 3), true);
  project.name = 'Na';
  project.vector.objects[0].x = 777;
  project.layout.pages[0].name = 'Aangepaste pagina';

  const previous = FluxCore.undoProjectHistory(undo, redo, project, 3);
  assert.equal(previous.name, 'Voor');
  assert.equal(previous.vector.objects[0].x, 10);
  assert.equal(previous.layout.pages[0].name, 'Pagina 1');
  assert.equal(redo.length, 1);
  assert.equal(redo[0].name, 'Na');
  assert.equal(redo[0].vector.objects[0].x, 777);

  const next = FluxCore.redoProjectHistory(undo, redo, previous, 3);
  assert.equal(next.name, 'Na');
  assert.equal(next.vector.objects[0].x, 777);
  assert.equal(next.layout.pages[0].name, 'Aangepaste pagina');

  const branchUndo = [], branchRedo = [];
  assert.equal(FluxCore.recordProjectHistory(branchUndo, branchRedo, previous, 3), true);
  const branchCurrent = { ...previous, name: 'Nieuwe bewerking' };
  const back = FluxCore.undoProjectHistory(branchUndo, branchRedo, branchCurrent, 3);
  assert.equal(back.name, 'Voor');
  assert.equal(branchRedo.length, 1);
  assert.equal(FluxCore.recordProjectHistory(branchUndo, branchRedo, back, 3), true);
  assert.equal(branchRedo.length, 0);
  assert.equal(FluxCore.redoProjectHistory(branchUndo, branchRedo, back, 3), null);
});

test('undo- en redo-geschiedenis blijft begrensd en lege acties veranderen niets', () => {
  const undo = [], redo = [];
  const project = FluxCore.createProject('pixel', 'Start');
  assert.equal(FluxCore.undoProjectHistory(undo, redo, project, 3), null);
  assert.equal(FluxCore.redoProjectHistory(undo, redo, project, 3), null);
  assert.deepEqual(undo, []);
  assert.deepEqual(redo, []);

  for (let index = 1; index <= 5; index++) {
    assert.equal(FluxCore.recordProjectHistory(undo, redo, project, 3), true);
    project.name = 'Bewerking ' + index;
  }
  assert.equal(undo.length, 3);

  let current = project;
  const undone = [];
  while (true) {
    const previous = FluxCore.undoProjectHistory(undo, redo, current, 3);
    if (!previous) break;
    current = previous;
    undone.push(current.name);
  }
  assert.deepEqual(undone, ['Bewerking 4', 'Bewerking 3', 'Bewerking 2']);
  assert.equal(undo.length, 0);
  assert.equal(redo.length, 3);
  assert.equal(FluxCore.undoProjectHistory(undo, redo, current, 3), null);

  const redone = [];
  while (true) {
    const next = FluxCore.redoProjectHistory(undo, redo, current, 3);
    if (!next) break;
    current = next;
    redone.push(current.name);
  }
  assert.deepEqual(redone, ['Bewerking 3', 'Bewerking 4', 'Bewerking 5']);
  assert.equal(redo.length, 0);
});



test('behoudt een bestaande objectselectie na undo en redo en wist verouderde selecties', () => {
  const object = FluxCore.makeObject('rect', 10, 20, 30, 40, { id: 'selected-shape' });
  const objects = [object];
  assert.equal(FluxCore.resolveSelectionId(objects, 'selected-shape'), 'selected-shape');
  assert.equal(FluxCore.resolveSelectionId(objects, 'missing-shape'), null);
  assert.equal(FluxCore.resolveSelectionId([], 'selected-shape'), null);
  assert.equal(FluxCore.resolveSelectionId(null, 'selected-shape'), null);
  assert.equal(FluxCore.resolveSelectionId(objects, null), null);
});


test('geschiedenis legt alleen echte inspectorwijzigingen vast en bewaart redo bij no-op', () => {
  const undo = [];
  const redo = [FluxCore.createProject('pixel', 'Redo bewaren')];
  const before = FluxCore.createProject('pixel', 'Voor');
  const unchanged = JSON.parse(JSON.stringify(before));

  assert.equal(FluxCore.recordProjectHistoryIfChanged(undo, redo, before, unchanged, 60), false);
  assert.deepEqual(undo, []);
  assert.equal(redo.length, 1, 'een no-op mag de redo-tak niet wissen');

  const changed = JSON.parse(JSON.stringify(before));
  changed.pixel.brightness = 145;
  assert.equal(FluxCore.recordProjectHistoryIfChanged(undo, redo, before, changed, 60), true);
  assert.deepEqual(undo, [before]);
  assert.deepEqual(redo, []);

  before.name = 'Gewijzigde bron';
  assert.equal(undo[0].name, 'Voor', 'geschiedenissnapshot moet onafhankelijk blijven van het bronobject');
});
