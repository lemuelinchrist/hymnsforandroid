import sys, pretty_midi, matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
d, t0, t1, *names = sys.argv[1:]; t0, t1 = float(t0), float(t1)
fig, ax = plt.subplots(len(names), 1, figsize=(26, 3.2 * len(names)), sharex=True, squeeze=False); ax = ax[:, 0]
for a, name in zip(ax, names):
    pm = pretty_midi.PrettyMIDI(f'{d}/midi/{name}.mid')
    for n in (n for i in pm.instruments for n in i.notes):
        if n.end > t0 and n.start < t1: a.plot([n.start, n.end], [n.pitch] * 2, lw=4, color='C0', solid_capstyle='butt')
    a.set_title(name); a.set_ylim(45.5, 81.5); a.set_xlim(t0, t1); a.grid(alpha=.3)
    a.set_yticks(range(46, 82)); a.set_yticklabels([pretty_midi.note_number_to_name(p) for p in range(46, 82)], fontsize=7)
plt.tight_layout(); plt.savefig(f'{d}/roll.png', dpi=65)
