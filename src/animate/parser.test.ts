import { describe, expect, it } from 'vitest';
import { availableAnimations } from './library';
import { friendlyReply, normalize, parsePrompt, resolveSteps, splitSegments } from './parser';
import dictionary from './dictionary.json';

const ok = (text: string) => {
  const r = parsePrompt(text);
  if (!r.ok) throw new Error(`"${text}" was not understood`);
  return r;
};
const ids = (text: string) => ok(text).steps.map((s) => s.id);

describe('normalize and split', () => {
  it('lowercases, drops accents and punctuation, treats hyphens as spaces', () => {
    expect(normalize('  Jalan-JALAN!  Café ')).toBe('jalan jalan cafe');
  });

  it('splits on English and Indonesian connectors and commas', () => {
    expect(splitSegments('walk then jump')).toEqual(['walk', 'jump']);
    expect(splitSegments('jalan terus loncat')).toEqual(['jalan', 'loncat']);
    expect(splitSegments('sit, wave and then dance')).toEqual(['sit', 'wave', 'dance']);
    expect(splitSegments('lari lalu duduk kemudian tidur')).toEqual(['lari', 'duduk', 'tidur']);
    expect(splitSegments('walk')).toEqual(['walk']);
  });

  it('keeps "squash and stretch" together', () => {
    expect(splitSegments('squash and stretch then spin')).toEqual(['squash and stretch', 'spin']);
  });
});

describe('English', () => {
  it('understands single moves in many forms', () => {
    expect(ids('cat jumping')).toEqual(['jump']);
    expect(ids('make the cat walk')).toEqual(['walk']);
    expect(ids('Please RUN!')).toEqual(['run']);
    expect(ids('sit down')).toEqual(['sit']);
    expect(ids('go to sleep')).toEqual(['lie_down']);
    expect(ids('say hi')).toEqual(['wave']);
    expect(ids('wag the tail')).toEqual(['tail_wag']);
    expect(ids('look around')).toEqual(['look_around']);
    expect(ids('clap your hands')).toEqual(['clap']);
  });

  it('makes sequences', () => {
    expect(ids('walk then jump then sit')).toEqual(['walk', 'jump', 'sit']);
    expect(ids('run and then lie down')).toEqual(['run', 'lie_down']);
  });

  it('reads speed and size words', () => {
    const [walk] = ok('walk slowly').steps;
    expect(walk.params.speed).toBeLessThan(0.7);
    const [run] = ok('run fast').steps;
    expect(run.params.speed).toBeGreaterThan(1.4);
    const [jump] = ok('jump high').steps;
    expect(jump.params.intensity).toBeGreaterThan(1.3);
    const [tiny] = ok('small jump').steps;
    expect(tiny.params.intensity).toBeLessThan(0.8);
  });

  it('applies modifiers to their own part of the request', () => {
    const { steps } = ok('walk slowly then run fast');
    expect(steps[0].params.speed).toBeLessThan(1);
    expect(steps[1].params.speed).toBeGreaterThan(1);
  });

  it('makes modifiers stronger with "very"', () => {
    const plain = ok('run fast').steps[0].params.speed;
    const strong = ok('run very fast').steps[0].params.speed;
    expect(strong).toBeGreaterThan(plain);
    expect(ok('walk very slowly').steps[0].params.speed).toBeLessThan(
      ok('walk slowly').steps[0].params.speed,
    );
  });

  it('reads repeats and durations', () => {
    expect(ok('jump twice').steps[0].repeat).toBe(2);
    expect(ok('jump 3 times').steps[0].repeat).toBe(3);
    expect(ok('walk for 5 seconds').steps[0].params.duration).toBe(5);
    expect(ok('wave 2x').steps[0].repeat).toBe(2);
  });
});

describe('Indonesian', () => {
  it('understands single moves', () => {
    expect(ids('kucing loncat')).toEqual(['jump']);
    expect(ids('kucing jalan')).toEqual(['walk']);
    expect(ids('lompat')).toEqual(['jump']);
    expect(ids('lari')).toEqual(['run']);
    expect(ids('duduk')).toEqual(['sit']);
    expect(ids('tidur')).toEqual(['lie_down']);
    expect(ids('dadah')).toEqual(['wave']);
    expect(ids('joget')).toEqual(['dance']);
    expect(ids('tepuk tangan')).toEqual(['clap']);
    expect(ids('kibas ekor')).toEqual(['tail_wag']);
    expect(ids('tolong buatkan dia melambai dong')).toEqual(['wave']);
  });

  it('makes sequences', () => {
    expect(ids('jalan terus loncat')).toEqual(['walk', 'jump']);
    expect(ids('lari lalu duduk kemudian tidur')).toEqual(['run', 'sit', 'lie_down']);
  });

  it('reads Indonesian speed, size and repeat words', () => {
    expect(ok('jalan pelan').steps[0].params.speed).toBeLessThan(0.7);
    expect(ok('lari cepat').steps[0].params.speed).toBeGreaterThan(1.4);
    expect(ok('loncat tinggi').steps[0].params.intensity).toBeGreaterThan(1.3);
    expect(ok('joget heboh').steps[0].params.intensity).toBeGreaterThan(1.5);
    expect(ok('lari cepat banget').steps[0].params.speed).toBeGreaterThan(
      ok('lari cepat').steps[0].params.speed,
    );
    expect(ok('loncat dua kali').steps[0].repeat).toBe(2);
    expect(ok('jalan selama 4 detik').steps[0].params.duration).toBe(4);
  });

  it('prefers a longer phrase over a shorter word inside it', () => {
    expect(ids('loncat kecil')).toEqual(['hop']);
    expect(ids('tepuk tangan')).not.toContain('clap_hands');
    expect(ids('lari kecil')).toEqual(['trot']);
  });
});

describe('the acceptance sentence', () => {
  it('"kucing jalan pelan terus loncat tinggi" is a slow walk then a high jump', () => {
    const { steps } = ok('kucing jalan pelan terus loncat tinggi');
    expect(steps.map((s) => s.id)).toEqual(['walk', 'jump']);
    expect(steps[0].params.speed).toBeLessThan(0.7);
    expect(steps[0].params.intensity).toBe(1);
    expect(steps[1].params.intensity).toBeGreaterThan(1.3);
    expect(steps[1].params.speed).toBe(1);
  });

  it('the English version means the same', () => {
    const { steps } = ok('cat walk slowly then jump high');
    expect(steps.map((s) => s.id)).toEqual(['walk', 'jump']);
    expect(steps[0].params.speed).toBeLessThan(0.7);
    expect(steps[1].params.intensity).toBeGreaterThan(1.3);
  });
});

describe('requests it does not understand', () => {
  it('returns a friendly failure with the words it did not know', () => {
    const r = parsePrompt('do a barrel roll');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('unknown');
      expect(r.unknown).toEqual(expect.arrayContaining(['barrel', 'roll']));
    }
  });

  it('asks for input when empty', () => {
    const r = parsePrompt('   ');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('empty');
  });

  it('keeps what it understood and reports what it skipped', () => {
    const r = ok('walk to the moon then jump');
    expect(r.steps.map((s) => s.id)).toEqual(['walk', 'jump']);
    expect(r.ignored).toEqual(expect.arrayContaining(['moon']));
  });

  it('suggests clickable animations in the reply', () => {
    const available = availableAnimations('quadruped');
    const reply = friendlyReply(parsePrompt('do a barrel roll'), available);
    expect(reply.message).toMatch(/Try one of these/);
    expect(reply.suggestions.length).toBeGreaterThan(3);
    expect(friendlyReply(parsePrompt(''), available).message).toMatch(/Type what/);
  });
});

describe('matching a request to a model', () => {
  it('passes through what the model can do', () => {
    const r = resolveSteps(ok('walk then jump').steps, availableAnimations('quadruped'));
    expect(r.steps.map((s) => s.id)).toEqual(['walk', 'jump']);
    expect(r.swapped).toEqual([]);
    expect(r.missing).toEqual([]);
  });

  it('swaps in a close whole-model motion when bones cannot do it', () => {
    const r = resolveSteps(ok('walk then jump').steps, availableAnimations('object'));
    expect(r.steps.map((s) => s.id)).toEqual(['wobble', 'hop']);
    expect(r.swapped).toEqual([
      { asked: 'walk', got: 'wobble' },
      { asked: 'jump', got: 'hop' },
    ]);
  });

  it('keeps the settings when it swaps', () => {
    const r = resolveSteps(ok('jump high').steps, availableAnimations(null));
    expect(r.steps[0].params.intensity).toBeGreaterThan(1.3);
  });

  it('reports a request nothing can stand in for, as a friendly reply', () => {
    const parsed = ok('swim');
    const entries = availableAnimations('quadruped').filter((a) => a.id !== 'float');
    const r = resolveSteps(parsed.steps, entries);
    expect(r.steps).toEqual([]);
    expect(r.missing).toEqual(['swim']);
    expect(friendlyReply(parsed, entries, r).message).toMatch(/can't do swim/);
  });
});

describe('the dictionary file', () => {
  it('has words in both languages for every animation', () => {
    for (const [id, phrases] of Object.entries(dictionary.animations)) {
      expect(phrases.length, id).toBeGreaterThanOrEqual(3);
    }
  });

  it('never uses a connector word as an animation word on its own', () => {
    const connectors = new Set(dictionary.connectors);
    for (const [id, phrases] of Object.entries(dictionary.animations)) {
      for (const p of phrases) expect(connectors.has(p), `${id}: ${p}`).toBe(false);
    }
  });

  it('every animation word parses back to its own animation', () => {
    for (const [id, phrases] of Object.entries(dictionary.animations)) {
      for (const p of phrases) {
        const r = parsePrompt(p);
        expect(r.ok, `"${p}"`).toBe(true);
        if (r.ok)
          expect(
            r.steps.map((s) => s.id),
            `"${p}"`,
          ).toContain(id);
      }
    }
  });
});
