import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { MessageSquare, ShieldCheck, ChevronDown } from 'lucide-react';
import api from '../services/api';

interface Activity {
  id: string;
  type: 'chat' | 'compliance';
  title: string;
  /** Raw ISO timestamp — never displayed; used only for sorting below. */
  date: string;
  detail: string;
}

export default function ActivityFeed() {
  const { user } = useAuth();
  const [activities, setActivities] = useState<Activity[]>([]);

  useEffect(() => {
    // Fetch real data from backend to populate this list
    const fetchHistory = async () => {
      try {
        // Per-call catches keep partial results: one failing endpoint still renders the other's data
        const chatRes = await api.get('/api/chat-sessions').catch(() => null);
        const compRes = await api.get('/api/compliance-history').catch(() => null);

        let newActivities: Activity[] = [];

        if (chatRes) {
          const chatsData = chatRes.data;
          const chats = chatsData.sessions || [];
          const chatActivities = chats.map((c: any) => ({
            id: c.id,
            type: 'chat',
            title: c.title,
            date: c.created_at,
            detail: 'started a new legal analysis chat'
          }));
          newActivities = [...newActivities, ...chatActivities];
        }

        if (compRes) {
          const compsData = compRes.data;
          const comps = compsData.history || [];
          const compActivities = comps.map((c: any) => ({
            id: c.id,
            type: 'compliance',
            title: c.filename,
            date: c.created_at,
            detail: 'uploaded a document for compliance check'
          }));
          newActivities = [...newActivities, ...compActivities];
        }

        // Sort by date (assuming newest first based on id for now or date parsing)
        newActivities.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setActivities(newActivities.slice(0, 10)); // keep last 10
      } catch (err) {
        console.error("Failed to fetch history", err);
      }
    };

    fetchHistory();
  }, []);

  return (
    <div className="activity-feed">
      <div className="activity-feed-header">
        <div>
          <h3>Latest activities</h3>
          <p>Today</p>
        </div>
        <button className="filter-btn">
          This week <ChevronDown size={14} />
        </button>
      </div>

      <div className="activity-list">
        {activities.length === 0 ? (
          <div className="empty-activity">No recent activity.</div>
        ) : (
          activities.map((act) => (
            <div key={act.id} className="activity-item">
              <div className="activity-avatar">
                {act.type === 'chat' ? <MessageSquare size={14} /> : <ShieldCheck size={14} />}
              </div>
              <div className="activity-content">
                <p>
                  <strong>{user?.username || 'You'}</strong> {act.detail}
                </p>
                <span className="activity-title">{act.title}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
