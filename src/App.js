import React from 'react';
import { Routes, Route } from 'react-router-dom';

import Header from './components/Header';
import DistinctionBackground from './components/DistinctionBackground';
import LandingPage from './pages/LandingPage';
import RulesPage from './pages/RulesPage';
import StrategyPage from './pages/StrategyPage';
import GamePage from './pages/GamePage';
import AIPage from './pages/AIPage';
import AuthPage from './pages/AuthPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import VerifyEmailPage from './pages/VerifyEmailPage';
import MultiplayerLobbyPage from './pages/MultiplayerLobbyPage';
import OnlineGamePage from './pages/OnlineGamePage';
import SettingsPage from './pages/SettingsPage';
import ReplayViewer from './pages/ReplayViewer';
import PrivacyPolicyPage from './pages/PrivacyPolicyPage';
import { SpectateWallPage, SpectateGamePage } from './pages/SpectatePage';
import { RequireAuth } from './context/AuthContext';
import './App.css';

const App = () => {
	return (
		<div className="app-shell">
			<DistinctionBackground />
			<Header />
			<main className="app-main">
				<Routes>
					<Route path="/" element={<LandingPage />} />
					<Route path="/rules" element={<RulesPage />} />
					<Route path="/strategy" element={<StrategyPage />} />
					<Route path="/ai" element={<AIPage />} />
					<Route path="/play" element={<GamePage />} />

					{/* Auth */}
					<Route path="/login" element={<AuthPage mode="login" />} />
					<Route path="/signup" element={<AuthPage mode="signup" />} />
					<Route path="/forgot-password" element={<ForgotPasswordPage />} />
					<Route path="/reset-password" element={<ResetPasswordPage />} />
					<Route path="/verify-email" element={<VerifyEmailPage />} />
					<Route path="/privacy" element={<PrivacyPolicyPage />} />

					{/* Spectator / projector view — deliberately unauthenticated so
					    the screen at an event never needs anyone to sign in on it. */}
					<Route path="/watch" element={<SpectateWallPage />} />
					<Route path="/watch/:gameId" element={<SpectateGamePage />} />

					{/* Authenticated multiplayer + account */}
					<Route
						path="/multiplayer"
						element={
							<RequireAuth>
								<MultiplayerLobbyPage />
							</RequireAuth>
						}
					/>
					<Route
						path="/play/online/:gameId"
						element={
							<RequireAuth>
								<OnlineGamePage />
							</RequireAuth>
						}
					/>
					<Route
						path="/settings"
						element={
							<RequireAuth>
								<SettingsPage />
							</RequireAuth>
						}
					/>
					<Route
						path="/replay/:gameId"
						element={
							<RequireAuth>
								<ReplayViewer />
							</RequireAuth>
						}
					/>

					{/* Typo'd or stale URL: show the landing page rather than a
					    blank <main> under the header. */}
					<Route path="*" element={<LandingPage />} />
				</Routes>
			</main>
		</div>
	);
};

export default App;
