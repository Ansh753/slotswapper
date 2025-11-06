import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';

const API_BASE = 'http://localhost:5000/api';

function App() {
  const [currentView, setCurrentView] = useState('login');
  const [isLogin, setIsLogin] = useState(true);
  const [user, setUser] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: ''
  });

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      setUser({ name: 'Test User', email: 'test@test.com' });
      setCurrentView('calendar');
    }
  }, []);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    try {
      const endpoint = isLogin ? '/auth/login' : '/auth/signup';
      const response = await axios.post(API_BASE + endpoint, formData);
      
      localStorage.setItem('token', response.data.token);
      setUser(response.data.user);
      setCurrentView('calendar');
    } catch (error) {
      alert(error.response?.data?.message || 'Something went wrong');
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
    setCurrentView('login');
  };

  // Login/Signup View
  if (!user) {
    return (
      <div className="App">
        <div className="auth-container">
          <h1>SlotSwapper</h1>
          <h2>{isLogin ? 'Welcome Back!' : 'Create Account'}</h2>
          <form onSubmit={handleAuth}>
            {!isLogin && (
              <input
                type="text"
                name="name"
                placeholder="Your Full Name"
                value={formData.name}
                onChange={handleChange}
                required
              />
            )}
            <input
              type="email"
              name="email"
              placeholder="Email Address"
              value={formData.email}
              onChange={handleChange}
              required
            />
            <input
              type="password"
              name="password"
              placeholder="Password"
              value={formData.password}
              onChange={handleChange}
              required
            />
            <button type="submit" className="btn-primary">
              {isLogin ? 'Sign In' : 'Create Account'}
            </button>
          </form>
          <p style={{ marginTop: '20px', color: '#718096' }}>
            {isLogin ? "Don't have an account? " : "Already have an account? "}
            <span className="link" onClick={() => setIsLogin(!isLogin)}>
              {isLogin ? 'Sign Up' : 'Sign In'}
            </span>
          </p>
        </div>
      </div>
    );
  }

  // Dashboard Views
  return (
    <div className="dashboard">
      {/* Header */}
      <div className="header">
        <h1> SlotSwapper</h1>
        <div className="user-info">
          Welcome, <strong>{user.name}</strong>
          <button onClick={logout} className="btn-secondary">Logout</button>
        </div>
      </div>

      {/* Navigation */}
      <div className="nav">
        <button 
          className={currentView === 'calendar' ? 'nav-active' : ''}
          onClick={() => setCurrentView('calendar')}
        >
           My Calendar
        </button>
        <button 
          className={currentView === 'marketplace' ? 'nav-active' : ''}
          onClick={() => setCurrentView('marketplace')}
        >
           Marketplace
        </button>
        <button 
          className={currentView === 'notifications' ? 'nav-active' : ''}
          onClick={() => setCurrentView('notifications')}
        >
           Notifications
        </button>
      </div>

      {/* Content */}
      <div className="content">
        {currentView === 'calendar' && (
          <>
            <h2>My Schedule</h2>
            <div className="event-grid">
              <div className="event-card">
                <h3>Team Meeting</h3>
                <p> October 25, 2024</p>
                <p> 10:00 AM - 11:00 AM</p>
                <p>Status: <span className="status-swappable">SWAPPABLE</span></p>
                <div className="action-buttons">
                  <button className="btn-small btn-warning">Make Busy</button>
                  <button className="btn-small btn-danger">Delete</button>
                </div>
              </div>
              
              <div className="event-card">
                <h3>Focus Time</h3>
                <p> October 26, 2024</p>
                <p> 2:00 PM - 3:00 PM</p>
                <p>Status: <span className="status-busy">BUSY</span></p>
                <div className="action-buttons">
                  <button className="btn-small btn-success">Make Swappable</button>
                  <button className="btn-small btn-danger">Delete</button>
                </div>
              </div>
            </div>
            
            <button className="btn-primary" style={{marginTop: '20px'}}>
              ➕ Add New Event
            </button>
          </>
        )}

        {currentView === 'marketplace' && (
          <>
            <h2>Available Time Slots</h2>
            <div className="event-grid">
              <div className="event-card">
                <h3>Design Review</h3>
                <p> From: John Doe</p>
                <p> October 27, 2024</p>
                <p> 3:00 PM - 4:00 PM</p>
                <div className="action-buttons">
                  <button className="btn-small btn-success">Request Swap</button>
                </div>
              </div>
              
              <div className="event-card">
                <h3>Code Session</h3>
                <p> From: Sarah Smith</p>
                <p> October 28, 2024</p>
                <p> 11:00 AM - 12:00 PM</p>
                <div className="action-buttons">
                  <button className="btn-small btn-success">Request Swap</button>
                </div>
              </div>
            </div>
          </>
        )}

        {currentView === 'notifications' && (
          <>
            <h2>Swap Requests</h2>
            <div className="event-grid">
              <div className="event-card">
                <h3>Swap Request</h3>
                <p>From: Jane Wilson</p>
                <p>Wants your: Team Meeting</p>
                <p> Offers: Project Planning (Oct 28, 2-3 PM)</p>
                <div className="action-buttons">
                  <button className="btn-small btn-success">Accept</button>
                  <button className="btn-small btn-danger">Reject</button>
                </div>
              </div>
            </div>
            
            <div style={{marginTop: '40px'}}>
              <h3>Your Requests</h3>
              <div className="event-card">
                <h3>Pending Swap</h3>
                <p> Waiting for: Mike Johnson</p>
                <p> Your offer: Focus Time</p>
                <p>Status: <span className="status-pending">PENDING</span></p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default App;