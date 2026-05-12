import { Search, ChevronDown, Bell, MessageSquare, Plus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function TopBar() {
  const { user } = useAuth();

  return (
    <div className="topbar">
      <div className="topbar-left">
        <div className="search-bar-top">
          <Search size={16} />
          <input type="text" placeholder="Search..." />
        </div>
        
        <div className="topbar-nav">
          <button className="topbar-dropdown">
            Projects <ChevronDown size={14} />
          </button>
          <button className="topbar-dropdown">
            Boards <ChevronDown size={14} />
          </button>
          <button className="topbar-dropdown">
            Filters <ChevronDown size={14} />
          </button>
        </div>

        <button className="create-btn-top">
          Create
        </button>
      </div>

      <div className="topbar-right">
        <button className="icon-btn-top">
          <MessageSquare size={18} />
        </button>
        <button className="icon-btn-top">
          <Bell size={18} />
        </button>
        <div className="profile-btn-top">
          <div className="avatar-small">
            {user?.username ? user.username.charAt(0).toUpperCase() : 'U'}
          </div>
        </div>
      </div>
    </div>
  );
}
