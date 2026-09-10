const round = (value, places = 2) => {
  const factor = 10 ** places;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

const artistKey = (name) => name.trim().normalize("NFC").toLocaleLowerCase("en-US");

function indexArtists(artists) {
  const indexed = new Map();

  for (const raw of artists) {
    if (!raw || typeof raw.name !== "string" || !raw.name.trim()) continue;

    const artist = {
      name: raw.name.trim().normalize("NFC"),
      playcount: Math.max(0, Number.parseInt(raw.playcount, 10) || 0),
      rank: Math.max(1, Number.parseInt(raw.rank, 10) || indexed.size + 1),
    };
    const key = artistKey(artist.name);
    const current = indexed.get(key);

    if (!current || artist.playcount > current.playcount) {
      indexed.set(key, artist);
    }
  }

  return indexed;
}

export function fingerprintLabel(overlapPercentage, sharedArtists) {
  if (sharedArtists === 0) return "Parallel Universes";
  if (overlapPercentage >= 60 && sharedArtists >= 50) return "Musical Twins";
  if (overlapPercentage >= 30 && sharedArtists >= 30) return "Same Scene, Different Tables";
  if (overlapPercentage >= 10 || sharedArtists >= 10) return "A Few Excellent Agreements";
  return "A Small but Mighty Crossover";
}

export function computeOverlap(user1Artists, user2Artists) {
  const user1 = indexArtists(user1Artists);
  const user2 = indexArtists(user2Artists);
  const shared = [];

  for (const [key, left] of user1) {
    const right = user2.get(key);
    if (!right) continue;

    const minPlaycount = Math.min(left.playcount, right.playcount);
    const maxPlaycount = Math.max(left.playcount, right.playcount);
    const matchScore = left.playcount > 0 && right.playcount > 0
      ? (2 * left.playcount * right.playcount) / (left.playcount + right.playcount)
      : 0;

    shared.push({
      artist: left.name,
      user1Playcount: left.playcount,
      user2Playcount: right.playcount,
      user1Rank: left.rank,
      user2Rank: right.rank,
      minPlaycount,
      balanceRatio: round(maxPlaycount ? minPlaycount / maxPlaycount : 0, 4),
      matchScore: round(Number.isFinite(matchScore) ? matchScore : 0),
      combinedPlaycount: left.playcount + right.playcount,
    });
  }

  shared.sort((a, b) =>
    b.matchScore - a.matchScore
    || b.minPlaycount - a.minPlaycount
    || b.combinedPlaycount - a.combinedPlaycount
    || a.artist.localeCompare(b.artist)
  );

  const sharedCount = shared.length;
  const combinedUniqueCount = user1.size + user2.size - sharedCount;
  const overlapPercentage = round(combinedUniqueCount ? sharedCount / combinedUniqueCount * 100 : 0, 1);

  // Requiring both ranks to be deep prevents one user's favourite from being
  // called a deep cut merely because the other user ranks it low.
  const deepCut = [...shared].sort((a, b) =>
    Math.min(b.user1Rank, b.user2Rank) - Math.min(a.user1Rank, a.user2Rank)
    || (b.user1Rank + b.user2Rank) - (a.user1Rank + a.user2Rank)
    || a.artist.localeCompare(b.artist)
  )[0] ?? null;

  return {
    counts: {
      user1Total: user1.size,
      user2Total: user2.size,
      user1Only: user1.size - sharedCount,
      user2Only: user2.size - sharedCount,
      shared: sharedCount,
      combinedUnique: combinedUniqueCount,
    },
    overlapPercentage,
    rankedShared: shared,
    fingerprint: {
      label: fingerprintLabel(overlapPercentage, sharedCount),
      overlapPercentage,
      sharedArtists: sharedCount,
      strongestArtists: shared.slice(0, 3).map(({ artist }) => artist),
      deepCut: deepCut ? {
        artist: deepCut.artist,
        user1Rank: deepCut.user1Rank,
        user2Rank: deepCut.user2Rank,
      } : null,
    },
  };
}
