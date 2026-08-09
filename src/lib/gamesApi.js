import { apiJson } from "./apiClient";

// --- Multiplayer game endpoints -------------------------------------------

export const createGame = (body) =>
  apiJson("/api/v1/games", { method: "POST", body: JSON.stringify(body) });

export const listOpenGames = () => apiJson("/api/v1/games/open");

export const listMyGames = () => apiJson("/api/v1/games/mine");

export const joinByCode = (code) =>
  apiJson("/api/v1/games/join", { method: "POST", body: JSON.stringify({ code }) });

export const joinById = (id) =>
  apiJson(`/api/v1/games/${id}/join`, { method: "POST" });

export const getGameState = (id) => apiJson(`/api/v1/games/${id}/state`);

export const postMove = (id, move) =>
  apiJson(`/api/v1/games/${id}/moves`, { method: "POST", body: JSON.stringify(move) });

export const resignGame = (id) =>
  apiJson(`/api/v1/games/${id}/resign`, { method: "POST" });

export const abortGame = (id) =>
  apiJson(`/api/v1/games/${id}/abort`, { method: "POST" });

export const getReplay = (id) => apiJson(`/api/v1/games/${id}/replay`);

// --- Account / GDPR --------------------------------------------------------

export const exportAccount = () => apiJson("/api/v1/account/export");

export const deleteAccount = () =>
  apiJson("/api/v1/account/delete", {
    method: "POST",
    body: JSON.stringify({ confirmText: "DELETE" }),
  });

// --- Helpers ---------------------------------------------------------------

export const resultText = (game, yourColor) => {
  if (game.status !== "finished") return null;
  const reasons = {
    no_legal_moves: "no legal moves",
    total_conversion: "total conversion",
    threefold: "threefold repetition",
    fifty_move: "the 50-move rule",
    forfeit_timeout: "forfeit on time",
    resign: "resignation",
    aborted: "aborted",
  };
  const reason = reasons[game.termination] || game.termination || "";
  if (game.winner === "DRAW") return `Draw by ${reason}.`;
  if (!yourColor) {
    return `${game.winner} wins${reason ? ` by ${reason}` : ""}.`;
  }
  const won = game.winner === yourColor;
  return `${won ? "You win" : "You lose"}${reason ? ` — ${reason}` : ""}.`;
};

// --- spectator (unauthenticated; for a projector at an event) --------------

export const listLiveGames = () => apiJson("/api/v1/spectate/games");
export const getSpectateGame = (id) => apiJson(`/api/v1/spectate/games/${id}`);
