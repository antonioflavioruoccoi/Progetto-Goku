export const PRICE_START = 13;
export const PRICE_ROUNDS = 12;
export const PRICE_DURATION = 15000;

export function validComparison(reference, candidate) {
  // Prices are stored in cents. Compare integers even at exactly 5%.
  return Math.abs(candidate.cents - reference.cents) * 20 >= reference.cents;
}

export function validatePricePool(cards) {
  const count = PRICE_ROUNDS + 1;
  const sorted = [...cards].sort((a, b) => a.cents - b.cents);
  const low = sorted.slice(0, Math.ceil(count / 2));
  const high = sorted.slice(-Math.floor(count / 2));
  if (cards.length < count || !validComparison(high[0], low.at(-1)))
    throw Error("PokéPrice: non ci sono abbastanza carte con prezzi confrontabili");
  return { low, high };
}

export function selectPriceCards(cards, random = Math.random) {
  const count = PRICE_ROUNDS + 1;
  const shuffle = items => {
    const shuffled = [...items];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  const pool = shuffle(cards);
  const selected = [pool.shift()];
  while (selected.length < count) {
    const next = pool.findIndex(card => validComparison(selected.at(-1), card));
    if (next === -1) break;
    selected.push(pool.splice(next, 1)[0]);
  }
  if (selected.length === count) return selected;

  // The build checks that the extreme groups can alternate in either direction.
  const fallback = validatePricePool(cards);
  const low = shuffle(fallback.low);
  const high = shuffle(fallback.high);
  return low.flatMap((card, i) => i < high.length ? [card, high[i]] : [card]);
}

export function priceCards(room) {
  const index = room.round - PRICE_START;
  return [room.priceOrder[index], room.priceOrder[index + 1]];
}

export function priceDirection(reference, candidate) {
  return candidate.cents > reference.cents ? "higher" : "lower";
}

export function settlePrice(room) {
  const correct = priceDirection(...priceCards(room));
  for (const [id, player] of Object.entries(room.players)) {
    const answer = room.answers[id];
    const won = answer?.choice === correct;
    player.streak = won ? (player.streak || 0) + 1 : 0;
    if (!answer) continue;
    answer.result = won ? "correct" : "wrong";
    answer.bonus = won && player.streak % 3 === 0 ? 20 : 0;
    answer.points = (won ? 100 : -50) + answer.bonus;
    player.score += answer.points;
  }
}

export function priceSnapshot(room, revealed) {
  const [reference, candidate] = priceCards(room);
  return {
    round: room.round - PRICE_START + 1,
    total: PRICE_ROUNDS,
    reference,
    candidate: revealed ? candidate : {
      id: candidate.id, name: candidate.name, set: candidate.set,
      number: candidate.number, image: candidate.image,
    },
    direction: revealed ? priceDirection(reference, candidate) : null,
    correct: revealed
      ? Object.values(room.answers).filter(answer => answer.result === "correct").length
      : null,
  };
}
