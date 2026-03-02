import React from 'react';
import { Routes, Route } from 'react-router-dom';

import Header from './components/Header';
import LandingPage from './pages/LandingPage';
import RulesPage from './pages/RulesPage';
import GamePage from './pages/GamePage';
import AIPage from './pages/AIPage';
import './App.css';

const App = () => {
	return (
		<div className="app-shell">
			<Header />
			<main className="app-main">
				<Routes>
					<Route path="/" element={<LandingPage />} />
					<Route path="/rules" element={<RulesPage />} />
					<Route path="/ai" element={<AIPage />} />
					<Route path="/play" element={<GamePage />} />
				</Routes>
			</main>
		</div>
	);
};

export default App;
