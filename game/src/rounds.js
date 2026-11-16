// Dustline rounds: buy phase, live phase, round end. First to 5 round wins,
// at most 9 rounds. Dust attacks on odd rounds, Heat on even rounds. The economy
// pays for kills, wins, losses and plants; the buy menu spends it between rounds.
export const BUY_SECONDS = 15;
export const LIVE_SECONDS = 100;
export const PLANT_SECONDS = 35;
export const WIN_ROUNDS = 5;
export const MAX_ROUNDS = 9;

export function createRounds() {
  const rounds = {
    phase: 'buy', // 'buy' | 'live' | 'over'
    round: 1,
    timeLeft: BUY_SECONDS,
    dustWins: 0,
    heatWins: 0,
    money: 800,
    kills: 0,
    planted: false,
    plantedSite: null,
    plantTimeLeft: 0,
    winner: null,
    matchOver: false,
    attackers: 'dust',
    plantSite: 'A',
  };

  function attackersFor(round) {
    return round % 2 === 1 ? 'dust' : 'heat';
  }

  function startRound() {
    rounds.phase = 'buy';
    rounds.timeLeft = BUY_SECONDS;
    rounds.planted = false;
    rounds.plantedSite = null;
    rounds.plantTimeLeft = 0;
    rounds.winner = null;
    rounds.attackers = attackersFor(rounds.round);
    rounds.plantSite = rounds.attackers === 'dust' ? (rounds.round % 4 === 1 ? 'A' : 'B') : (rounds.round % 4 === 0 ? 'B' : 'A');
  }

  function beginLive() {
    rounds.phase = 'live';
    rounds.timeLeft = LIVE_SECONDS;
  }

  function plant(site) {
    rounds.planted = true;
    rounds.plantedSite = site;
    rounds.plantTimeLeft = PLANT_SECONDS;
    rounds.money += 300;
  }

  function endRound(winner, reason) {
    if (rounds.phase === 'over') return;
    rounds.phase = 'over';
    rounds.winner = winner;
    if (winner === 'dust') rounds.dustWins += 1;
    else rounds.heatWins += 1;
    rounds.money += winner === 'dust' ? 3000 : 1900;
    if (rounds.dustWins >= WIN_ROUNDS || rounds.heatWins >= WIN_ROUNDS || rounds.round >= MAX_ROUNDS) {
      rounds.matchOver = true;
    }
    rounds.timeLeft = 4;
    return reason;
  }

  function nextRound() {
    rounds.round += 1;
    startRound();
  }

  return {
    state: rounds,
    startRound,
    beginLive,
    plant,
    endRound,
    nextRound,
    addKill() {
      rounds.kills += 1;
      rounds.money += 300;
    },
    spend(amount) {
      if (rounds.money < amount) return false;
      rounds.money -= amount;
      return true;
    },
  };
}
