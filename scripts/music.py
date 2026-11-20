"""Render two original, seamless chiptune loops; Python standard library only."""
from array import array
import math
from pathlib import Path
import random
import sys
import wave

RATE = 22050
OUT = Path(__file__).resolve().parent.parent / "assets/audio"


def render(filename, bpm, chords, melody):
    beat = 60 / bpm
    length = 16 * 4 * beat
    samples = array("f", [0]) * round(length * RATE)
    rng = random.Random(20261120)

    def note(midi, start, duration, gain, voice="pulse"):
        frequency = 440 * 2 ** ((midi - 69) / 12)
        count = round(duration * RATE)
        first = round(start * RATE)
        for i in range(count):
            t = i / RATE
            phase = (t * frequency) % 1
            if voice == "bass":
                value = 1 - 4 * abs(phase - .5)
            elif voice == "bell":
                value = math.sin(2 * math.pi * phase) * math.exp(-4 * t / duration)
            else:
                value = .7 * math.sin(2 * math.pi * phase) + .2 * math.sin(6 * math.pi * phase)
            envelope = min(1, t / .008, (duration - t) / .025)
            index = first + i
            samples[index % len(samples)] += gain * envelope * value

    for bar in range(16):
        root, third, fifth = chords[bar % len(chords)]
        start = bar * 4 * beat
        for step in range(8):
            pitch = melody[bar % len(melody)][step]
            if pitch:
                note(pitch + (12 if bar >= 8 and step in (3, 7) else 0),
                     start + step * beat / 2, beat * .43, .16)
            note((root, third, fifth, third)[step % 4] + 12,
                 start + step * beat / 2, beat * .35, .045, "bell")
        for step in range(4):
            note(root - 12 if step % 2 == 0 else fifth - 12,
                 start + step * beat, beat * .7, .18, "bass")
            # Quiet noise hats and a sine kick keep both loops below the dialogue.
            for i in range(round(.045 * RATE)):
                t = i / RATE
                value = rng.uniform(-1, 1) * math.exp(-100 * t) * .035
                if step % 2 == 0:
                    value += math.sin(2 * math.pi * (65 * t - 150 * t * t)) * math.exp(-60 * t) * .16
                samples[(round((start + step * beat) * RATE) + i) % len(samples)] += value

    peak = max(abs(v) for v in samples)
    assert 0 < peak < 1, f"Unexpected silence or clipping: {peak}"
    pcm = array("h", (round(v * 28000 / peak) for v in samples))
    if sys.byteorder != "little":
        pcm.byteswap()
    OUT.mkdir(parents=True, exist_ok=True)
    with wave.open(str(OUT / filename), "wb") as audio:
        audio.setparams((1, 2, RATE, len(pcm), "NONE", "not compressed"))
        audio.writeframes(pcm.tobytes())
    with wave.open(str(OUT / filename)) as audio:
        assert audio.getnframes() == len(samples) and audio.getnchannels() == 1
    print(f"{filename}: {length:.1f}s, peak normalized, PCM verified")


if __name__ == "__main__":
    render("oak-notebook.wav", 112,
           [(57, 60, 64), (53, 57, 60), (60, 64, 67), (55, 59, 62)],
           [(76, 0, 79, 76, 72, 74, 76, 0), (72, 0, 69, 72, 76, 74, 72, 0),
            (79, 76, 74, 72, 76, 0, 79, 81), (79, 74, 71, 74, 76, 74, 71, 0)])
    render("castelia-card-market.wav", 132,
           [(60, 64, 67), (57, 60, 64), (53, 57, 60), (55, 59, 62)],
           [(76, 79, 0, 81, 79, 76, 74, 76), (72, 76, 79, 0, 81, 79, 76, 72),
            (77, 0, 76, 72, 69, 72, 76, 77), (74, 79, 83, 81, 79, 77, 74, 0)])
