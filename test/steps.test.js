// Pure tests for the step model (app/lib/steps.js): flattening, nesting, edits.
(async () => {
  const S = await import('../app/lib/steps.js');
  let ok = 0, n = 0;
  const check = (name, pass, extra) => { n++; if (pass) ok++; console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (extra ? '  → ' + extra : '')); };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  const w = S.makeStep('work', 'white', 60), r = S.makeStep('rest', 'both', 15), b = S.makeStep('work', 'blue', 60);
  check('a work step becomes a work phase for that side', same(S.stepsToPhases([w]).map(p => [p.phase, p.who, p.duration, p.label]), [['work', 'white', 60, 'לבן עובד']]));
  check('a rest step has no side and says מנוחה', same(S.stepsToPhases([r]).map(p => [p.phase, p.who, p.label]), [['rest', 'none', 'מנוחה']]));

  const g = S.makeGroup('סבב', 3, [w, r, b, r]);
  const ph = S.stepsToPhases([g]);
  check('a group repeats its steps', ph.length === 12, String(ph.length));
  check('rounds are numbered inside a group', ph[0].round === 1 && ph[0].rounds === 3 && ph[11].round === 3);
  check('total time adds up', S.totalSteps([g]) === 3 * (60 + 15 + 60 + 15), String(S.totalSteps([g])));

  const nested = S.makeGroup('חיצוני', 2, [S.makeStep('work', 'both', 10), S.makeGroup('פנימי', 3, [S.makeStep('work', 'both', 5)])]);
  check('a drill inside a drill flattens (2 × (10 + 3×5))', S.totalSteps([nested]) === 2 * (10 + 15) && S.stepsToPhases([nested]).length === 8);
  check('the innermost round wins', S.stepsToPhases([nested]).filter(p => p.duration === 5).every(p => p.rounds === 3));

  const copy = S.cloneNodes([g]);
  check('cloning gives new ids at every depth', copy[0].id !== g.id && copy[0].steps[0].id !== g.steps[0].id && S.totalSteps(copy) === S.totalSteps([g]));

  let tree = [w, g];
  tree = S.insertAt(tree, [1], 1, S.makeStep('rest', 'both', 5));
  check('insert into a group by path', tree[1].steps.length === 5 && tree[1].steps[1].duration === 5);
  tree = S.updateAt(tree, [1], 0, { duration: 99 });
  check('update inside a group', tree[1].steps[0].duration === 99 && g.steps[0].duration === 60);
  tree = S.removeAt(tree, [1], 1);
  check('remove inside a group', tree[1].steps.length === 4);
  tree = S.moveWithin(tree, [], 0, 1);
  check('reorder at the root', tree[0].type === 'group' && tree[1].type === 'step');
  check('getAt follows a path', S.getAt(tree, [0]).length === 4);

  check('parseDur understands m:ss and seconds', S.parseDur('1:30') === 90 && S.parseDur('45') === 45 && S.parseDur('x') === null);
  check('fmtDur', S.fmtDur(90) === '1:30' && S.fmtDur(300) === '5:00');

  const drill = S.makeStepsDrill({ name: 'x', steps: [g] });
  check('a steps-drill keeps the fields the older screens read', drill.type === 'steps' && drill.rounds === 1 && drill.durationWork === S.totalSteps([g]));
  console.log('\n' + ok + '/' + n + ' checks passed');
  process.exit(ok === n ? 0 : 1);
})();
