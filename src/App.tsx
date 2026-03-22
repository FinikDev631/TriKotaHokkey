import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { 
  collection, 
  doc, 
  setDoc, 
  updateDoc, 
  query, 
  where, 
  orderBy, 
  limit, 
  onSnapshot, 
  addDoc, 
  serverTimestamp, 
  getDocs,
  getDoc,
  deleteDoc
} from 'firebase/firestore';
import { 
  auth, 
  db, 
  loginWithGoogle, 
  logout, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  updateProfile 
} from './firebase';
import { UserProfile, Match, Character, CHARACTERS, Bot, BOTS } from './types';
import { 
  Trophy, User, Play, LogOut, Settings, Award, ArrowLeft, 
  Loader2, Users, Bot as BotIcon, Volume2, VolumeX, Zap, Shield, Move,
  Mail, Lock, ShieldAlert, Search, Plus, Minus
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Howl } from 'howler';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Sound Manager
const sounds = {
  click: new Howl({ src: ['https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3'] }),
  hit: new Howl({ src: ['https://assets.mixkit.co/active_storage/sfx/2578/2578-preview.mp3'] }),
  goal: new Howl({ src: ['https://assets.mixkit.co/active_storage/sfx/2020/2020-preview.mp3'] }),
  win: new Howl({ src: ['https://assets.mixkit.co/active_storage/sfx/1435/1435-preview.mp3'] }),
  lose: new Howl({ src: ['https://assets.mixkit.co/active_storage/sfx/1436/1436-preview.mp3'] }),
  bgm: new Howl({ 
    src: ['https://assets.mixkit.co/active_storage/sfx/123/123-preview.mp3'], 
    loop: true, 
    volume: 0.3 
  })
};

const playSound = (name: keyof typeof sounds) => {
  if (localStorage.getItem('soundEnabled') !== 'false') {
    sounds[name].play();
  }
};

const FIELD_WIDTH = 1200;
const FIELD_HEIGHT = 700;
const GOAL_SIZE = 250;
const GOAL_Y = (FIELD_HEIGHT - GOAL_SIZE) / 2;

// Elo calculation
const calculateElo = (winnerElo: number, loserElo: number) => {
  const K = 40; // Higher K for faster progression
  const expectedWinner = 1 / (1 + Math.pow(10, (loserElo - winnerElo) / 400));
  
  // Winner always gains at least 15 points, loser loses at most 10 if they were much weaker
  const gain = Math.max(15, Math.round(K * (1 - expectedWinner)));
  const loss = Math.max(5, Math.round(K * (1 - expectedWinner) * 0.6)); // Lose less than you gain to reduce frustration
  
  return { 
    newWinnerElo: winnerElo + gain, 
    newLoserElo: Math.max(0, loserElo - loss) 
  };
};

export default function App() {
  const [user, loading] = useAuthState(auth);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [view, setView] = useState<'menu' | 'game' | 'leaderboard' | 'character' | 'profile_edit' | 'admin' | 'auth'>('menu');
  const [selectedChar, setSelectedChar] = useState<Character>(CHARACTERS[0]);
  const [selectedBot, setSelectedBot] = useState<Bot | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem('soundEnabled') !== 'false');
  const [editName, setEditName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editPhotoURL, setEditPhotoURL] = useState('');
  
  // Auth state
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [authError, setAuthError] = useState('');

  // Admin state
  const [adminSearch, setAdminSearch] = useState('');
  const [adminUsers, setAdminUsers] = useState<UserProfile[]>([]);

  const isAdmin = user?.email === 'korkinsasha667@gmail.com' || user?.email === 'finiklts@gmail.com';

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    try {
      if (authMode === 'signup') {
        const res = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(res.user, { displayName });
        await setDoc(doc(db, 'users', res.user.uid), {
          uid: res.user.uid,
          displayName: displayName || email.split('@')[0],
          photoURL: `https://api.dicebear.com/7.x/avataaars/svg?seed=${res.user.uid}`,
          elo: 1000,
          wins: 0,
          losses: 0,
          bio: ''
        });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      playSound('click');
    } catch (err: any) {
      setAuthError(err.message);
    }
  };

  const fetchAdminUsers = async () => {
    if (!isAdmin) return;
    const q = query(collection(db, 'users'), limit(20));
    const snap = await getDocs(q);
    setAdminUsers(snap.docs.map(d => d.data() as UserProfile));
  };

  const updateEloAdmin = async (uid: string, amount: number) => {
    if (!isAdmin) return;
    const userRef = doc(db, 'users', uid);
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      const data = snap.data() as UserProfile;
      await updateDoc(userRef, { elo: Math.max(0, data.elo + amount) });
      fetchAdminUsers();
      playSound('click');
    }
  };

  const toggleBanAdmin = async (uid: string, currentStatus: boolean) => {
    if (!isAdmin) return;
    const userRef = doc(db, 'users', uid);
    await updateDoc(userRef, { isBanned: !currentStatus });
    fetchAdminUsers();
    playSound('click');
  };

  useEffect(() => {
    if (profile) {
      setEditName(profile.displayName);
      setEditBio(profile.bio || '');
      setEditPhotoURL(profile.photoURL || '');
    }
  }, [profile]);

  const updateUserProfile = async () => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        displayName: editName,
        bio: editBio,
        photoURL: editPhotoURL
      });
      setView('menu');
      playSound('click');
    } catch (err) {
      console.error("Update profile error:", err);
    }
  };

  useEffect(() => {
    if (soundEnabled) {
      if (!sounds.bgm.playing()) sounds.bgm.play();
    } else {
      sounds.bgm.stop();
    }
  }, [soundEnabled]);

  useEffect(() => {
    const handleInteraction = () => {
      if (soundEnabled && !sounds.bgm.playing()) {
        sounds.bgm.play();
      }
      window.removeEventListener('click', handleInteraction);
      window.removeEventListener('keydown', handleInteraction);
    };
    window.addEventListener('click', handleInteraction);
    window.addEventListener('keydown', handleInteraction);
    return () => {
      window.removeEventListener('click', handleInteraction);
      window.removeEventListener('keydown', handleInteraction);
    };
  }, [soundEnabled]);

  const toggleSound = () => {
    const newState = !soundEnabled;
    setSoundEnabled(newState);
    localStorage.setItem('soundEnabled', String(newState));
    if (newState) sounds.bgm.play();
    else sounds.bgm.stop();
    playSound('click');
  };

  // Profile management
  useEffect(() => {
    if (user) {
      const userRef = doc(db, 'users', user.uid);
      const unsubscribe = onSnapshot(userRef, (docSnap) => {
        if (docSnap.exists()) {
          setProfile(docSnap.data() as UserProfile);
        } else {
          const newProfile: UserProfile = {
            uid: user.uid,
            displayName: user.displayName || 'Игрок',
            photoURL: user.photoURL || '',
            elo: 1000,
            wins: 0,
            losses: 0,
          };
          setDoc(userRef, newProfile);
        }
      });
      return () => unsubscribe();
    } else {
      setProfile(null);
    }
  }, [user]);

  // Matchmaking
  const startMatchmaking = async () => {
    if (!user || !profile) return;
    setIsSearching(true);
    playSound('click');
    
    try {
      const matchesRef = collection(db, 'matches');
      const q = query(matchesRef, where('status', '==', 'waiting'), limit(5)); // Get a few to reduce collision
      const querySnapshot = await getDocs(q);
      
      let joined = false;
      if (!querySnapshot.empty) {
        for (const matchDoc of querySnapshot.docs) {
          const matchData = matchDoc.data() as Match;
          if (matchData.player1 !== user.uid && matchData.status === 'waiting') {
            await updateDoc(doc(db, 'matches', matchDoc.id), {
              player2: user.uid,
              player2Char: selectedChar.id,
              status: 'playing',
              updatedAt: serverTimestamp(),
              player2Pos: { x: FIELD_WIDTH - 150, y: FIELD_HEIGHT / 2 },
              player2Score: 0
            });
            joined = true;
            setView('game');
            break;
          }
        }
      } 
      
      if (!joined) {
        const newMatch = {
          player1: user.uid,
          player1Char: selectedChar.id,
          player1Score: 0,
          player2Score: 0,
          status: 'waiting',
          ballPos: { 
            x: FIELD_WIDTH / 2, 
            y: FIELD_HEIGHT / 2, 
            vx: (Math.random() > 0.5 ? 1 : -1) * 5, 
            vy: (Math.random() > 0.5 ? 1 : -1) * 5 
          },
          player1Pos: { x: 150, y: FIELD_HEIGHT / 2 },
          player2Pos: { x: FIELD_WIDTH - 150, y: FIELD_HEIGHT / 2 },
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };
        const docRef = await addDoc(collection(db, 'matches'), newMatch);
        
        const unsubscribe = onSnapshot(docRef, (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data() as Match;
            if (data.status === 'playing') {
              unsubscribe();
              setIsSearching(false);
              setView('game');
            }
          }
        });
      }
    } catch (err) {
      console.error("Matchmaking error:", err);
      setIsSearching(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-screen bg-sky-950"><Loader2 className="w-12 h-12 animate-spin text-sky-400" /></div>;

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-sky-950 p-4 overflow-hidden relative">
        <div className="absolute inset-0 opacity-20 pointer-events-none">
          <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_50%,rgba(56,189,248,0.2),transparent_70%)]" />
        </div>
        <motion.div 
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-white/10 backdrop-blur-xl p-8 rounded-[3rem] shadow-2xl text-center max-w-md w-full border-2 border-white/20 relative z-10"
        >
          <div className="mb-6 relative">
            <Trophy className="w-16 h-16 text-yellow-400 mx-auto drop-shadow-[0_0_15px_rgba(250,204,21,0.5)]" />
          </div>
          <h1 className="text-4xl font-black text-white mb-1 uppercase tracking-tighter italic">Три Кота</h1>
          <h2 className="text-xl font-bold text-sky-400 mb-8 uppercase tracking-widest">ХОККЕЙ ОНЛАЙН</h2>
          
          {view === 'auth' ? (
            <form onSubmit={handleEmailAuth} className="space-y-4">
              <div className="space-y-2 text-left">
                {authMode === 'signup' && (
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                    <input 
                      type="text" placeholder="Никнейм" value={displayName} onChange={e => setDisplayName(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white focus:border-sky-500 outline-none"
                      required
                    />
                  </div>
                )}
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                  <input 
                    type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white focus:border-sky-500 outline-none"
                    required
                  />
                </div>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                  <input 
                    type="password" placeholder="Пароль" value={password} onChange={e => setPassword(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white focus:border-sky-500 outline-none"
                    required
                  />
                </div>
              </div>

              {authError && <p className="text-red-400 text-sm font-bold">{authError}</p>}

              <button 
                type="submit"
                className="w-full py-4 bg-sky-500 hover:bg-sky-400 text-white rounded-xl font-black text-xl transition-all shadow-lg"
              >
                {authMode === 'login' ? 'ВОЙТИ' : 'ЗАРЕГИСТРИРОВАТЬСЯ'}
              </button>

              <div className="flex justify-between text-sm font-bold">
                <button type="button" onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')} className="text-sky-400 hover:underline">
                  {authMode === 'login' ? 'Нет аккаунта?' : 'Уже есть аккаунт?'}
                </button>
                <button type="button" onClick={() => setView('menu')} className="text-white/40 hover:text-white">Назад</button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              <button 
                onClick={() => { loginWithGoogle(); playSound('click'); }}
                className="w-full py-5 bg-white text-sky-950 hover:bg-sky-50 rounded-2xl font-black text-xl transition-all flex items-center justify-center gap-4 shadow-xl group"
              >
                <img src="https://www.google.com/favicon.ico" className="w-6 h-6" alt="Google" /> GOOGLE ВХОД
              </button>
              <button 
                onClick={() => { setView('auth'); playSound('click'); }}
                className="w-full py-5 bg-sky-500/20 hover:bg-sky-500/30 text-sky-400 border-2 border-sky-500/30 rounded-2xl font-black text-xl transition-all flex items-center justify-center gap-4 group"
              >
                <Mail className="w-6 h-6" /> EMAIL / ПАРОЛЬ
              </button>
            </div>
          )}
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-sky-950 text-white font-sans selection:bg-sky-500 selection:text-white">
      <AnimatePresence mode="wait">
        {profile?.isBanned && (
          <motion.div 
            key="banned"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-2xl flex flex-col items-center justify-center p-8 text-center"
          >
            <ShieldAlert className="w-32 h-32 text-red-500 mb-8 animate-pulse" />
            <h1 className="text-6xl font-black text-white mb-4 uppercase italic tracking-tighter">ВЫ ЗАБАНЕНЫ</h1>
            <p className="text-white/60 text-xl font-bold max-w-md mb-12 uppercase tracking-widest">
              Ваш аккаунт был заблокирован администрацией за нарушение правил игры.
            </p>
            <button 
              onClick={() => logout()}
              className="px-12 py-5 bg-red-500 hover:bg-red-400 text-white rounded-2xl font-black text-2xl transition-all shadow-2xl shadow-red-500/20"
            >
              ВЫЙТИ ИЗ АККАУНТА
            </button>
          </motion.div>
        )}

        {view === 'menu' && (
          <motion.div 
            key="menu"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="max-w-5xl mx-auto p-8 pt-16"
          >
            <div className="flex justify-between items-center mb-16">
              <div className="flex items-center gap-6 bg-white/5 p-4 pr-8 rounded-full border border-white/10 backdrop-blur-md">
                <div className="relative">
                  <img src={profile?.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`} className="w-20 h-20 rounded-full border-4 border-sky-500 shadow-lg shadow-sky-500/20" alt="Avatar" />
                  <div className="absolute -bottom-1 -right-1 bg-yellow-400 text-sky-950 p-1.5 rounded-full shadow-lg">
                    <Trophy className="w-4 h-4" />
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-2xl font-black tracking-tight">{profile?.displayName}</h2>
                    <button 
                      onClick={() => { setView('profile_edit'); playSound('click'); }}
                      className="p-1.5 bg-white/10 hover:bg-white/20 rounded-lg transition-all"
                    >
                      <Settings className="w-4 h-4 text-sky-400" />
                    </button>
                  </div>
                  <div className="flex items-center gap-4 mt-1">
                    <span className="text-sky-400 font-black text-sm uppercase tracking-widest">{profile?.elo} ELO</span>
                    <div className="h-4 w-px bg-white/10" />
                    <span className="text-emerald-400 font-bold text-xs uppercase">{profile?.wins}W / {profile?.losses}L</span>
                  </div>
                </div>
              </div>
              
              <div className="flex gap-4">
                {isAdmin && (
                  <button 
                    onClick={() => { setView('admin'); fetchAdminUsers(); playSound('click'); }}
                    className="p-4 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 rounded-2xl border border-yellow-500/20 transition-all"
                  >
                    <ShieldAlert className="w-6 h-6" />
                  </button>
                )}
                <button 
                  onClick={toggleSound}
                  className="p-4 bg-white/5 hover:bg-white/10 rounded-2xl border border-white/10 transition-all text-sky-400"
                >
                  {soundEnabled ? <Volume2 className="w-6 h-6" /> : <VolumeX className="w-6 h-6" />}
                </button>
                <button onClick={() => { logout(); playSound('click'); }} className="p-4 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-2xl border border-red-500/20 transition-all">
                  <LogOut className="w-6 h-6" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <button 
                onClick={() => { setView('character'); playSound('click'); }}
                className="group relative h-80 overflow-hidden bg-gradient-to-br from-sky-500 to-blue-600 p-10 rounded-[3rem] shadow-2xl transition-all hover:scale-[1.02] active:scale-95 text-left"
              >
                <div className="relative z-10 h-full flex flex-col justify-between">
                  <div>
                    <h3 className="text-5xl font-black mb-2 italic tracking-tighter">ИГРАТЬ</h3>
                    <p className="text-white/80 font-bold text-lg uppercase tracking-widest">Начни свой путь к славе</p>
                  </div>
                  <div className="flex items-center gap-2 font-black text-xl">
                    В БОЙ <ArrowLeft className="w-6 h-6 rotate-180" />
                  </div>
                </div>
                <Play className="absolute right-[-40px] bottom-[-40px] w-80 h-80 text-white/10 group-hover:scale-110 group-hover:rotate-12 transition-transform duration-500" />
              </button>

              <button 
                onClick={() => { setView('leaderboard'); playSound('click'); }}
                className="group relative h-80 overflow-hidden bg-white/5 p-10 rounded-[3rem] shadow-xl border-2 border-white/10 hover:border-yellow-400/50 transition-all hover:scale-[1.02] active:scale-95 text-left"
              >
                <div className="relative z-10 h-full flex flex-col justify-between">
                  <div>
                    <h3 className="text-5xl font-black mb-2 italic tracking-tighter text-yellow-400">ТОПЫ</h3>
                    <p className="text-white/60 font-bold text-lg uppercase tracking-widest">Лучшие игроки сезона</p>
                  </div>
                  <div className="flex items-center gap-2 font-black text-xl text-yellow-400">
                    РЕЙТИНГ <ArrowLeft className="w-6 h-6 rotate-180" />
                  </div>
                </div>
                <Trophy className="absolute right-[-40px] bottom-[-40px] w-80 h-80 text-yellow-400/5 group-hover:scale-110 group-hover:-rotate-12 transition-transform duration-500" />
              </button>
            </div>

            <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
              <StatCard label="Победы" value={profile?.wins || 0} color="text-emerald-400" />
              <StatCard label="Поражения" value={profile?.losses || 0} color="text-red-400" />
              <StatCard label="Рейтинг" value={profile?.elo || 1000} color="text-sky-400" />
            </div>
          </motion.div>
        )}

        {view === 'profile_edit' && (
          <motion.div 
            key="profile_edit"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="max-w-md mx-auto p-8 pt-16"
          >
            <button onClick={() => { setView('menu'); playSound('click'); }} className="mb-8 flex items-center gap-2 font-black text-sky-400 hover:text-sky-300 uppercase tracking-widest">
              <ArrowLeft className="w-5 h-5" /> Назад
            </button>
            <div className="bg-white/5 backdrop-blur-xl p-8 rounded-[3rem] border border-white/10 shadow-2xl">
              <h2 className="text-3xl font-black mb-8 italic tracking-tighter uppercase text-center">Профиль</h2>
              
              <div className="space-y-6">
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-white/40 mb-2">Имя в игре</label>
                  <input 
                    type="text" 
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 font-bold focus:border-sky-500 outline-none transition-all"
                    placeholder="Твое имя..."
                  />
                </div>
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-white/40 mb-2">Ссылка на аватарку</label>
                  <input 
                    type="text" 
                    value={editPhotoURL}
                    onChange={(e) => setEditPhotoURL(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 font-bold focus:border-sky-500 outline-none transition-all"
                    placeholder="https://..."
                  />
                </div>
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-white/40 mb-2">О себе</label>
                  <textarea 
                    value={editBio}
                    onChange={(e) => setEditBio(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 font-bold focus:border-sky-500 outline-none transition-all h-32 resize-none"
                    placeholder="Расскажи о себе..."
                  />
                </div>
                <button 
                  onClick={updateUserProfile}
                  className="w-full py-4 bg-sky-500 hover:bg-sky-400 text-white rounded-2xl font-black text-xl transition-all shadow-lg shadow-sky-500/20"
                >
                  СОХРАНИТЬ
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {view === 'character' && (
          <motion.div 
            key="character"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            className="max-w-6xl mx-auto p-8 pt-16"
          >
            <button onClick={() => { setView('menu'); playSound('click'); }} className="mb-12 flex items-center gap-3 font-black text-sky-400 hover:text-sky-300 text-xl uppercase tracking-widest group">
              <ArrowLeft className="w-6 h-6 group-hover:-translate-x-2 transition-transform" /> НАЗАД
            </button>
            
            <h2 className="text-6xl font-black mb-16 text-center italic tracking-tighter uppercase">Выбери Кота</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-20">
              {CHARACTERS.map(char => (
                <button 
                  key={char.id}
                  onClick={() => { setSelectedChar(char); playSound('click'); }}
                  className={cn(
                    "relative p-8 rounded-[3rem] border-4 transition-all text-center bg-white/5 backdrop-blur-md overflow-hidden group",
                    selectedChar.id === char.id ? "border-sky-500 scale-105 shadow-[0_0_50px_rgba(14,165,233,0.3)]" : "border-white/10 hover:border-white/30"
                  )}
                >
                  <div className="relative z-10">
                    <div className="relative w-48 h-48 mx-auto mb-8">
                      <img src={char.imageUrl} className="w-full h-full object-cover rounded-full border-8 border-white/10 shadow-2xl" alt={char.name} />
                      {selectedChar.id === char.id && (
                        <motion.div layoutId="active-char" className="absolute -inset-4 border-4 border-sky-500 rounded-full animate-pulse" />
                      )}
                    </div>
                    <h3 className="text-3xl font-black mb-6 uppercase italic tracking-tighter">{char.name}</h3>
                    <div className="space-y-4">
                      <StatBar label="Скорость" value={char.speed} max={1.5} icon={<Zap className="w-3 h-3" />} />
                      <StatBar label="Сила" value={char.power} max={1.5} icon={<Shield className="w-3 h-3" />} />
                      <StatBar label="Размер" value={char.size} max={1.5} icon={<Move className="w-3 h-3" />} />
                    </div>
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              ))}
            </div>

            <div className="bg-white/5 rounded-[3rem] p-10 border border-white/10">
              <h2 className="text-3xl font-black mb-8 text-center uppercase flex items-center justify-center gap-4 italic tracking-tighter">
                <BotIcon className="w-10 h-10 text-sky-400" /> ТРЕНИРОВКА С БОТОМ
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {BOTS.map(bot => (
                  <button 
                    key={bot.id}
                    onClick={() => { setSelectedBot(selectedBot?.id === bot.id ? null : bot); playSound('click'); }}
                    className={cn(
                      "p-6 rounded-3xl border-2 transition-all text-center group",
                      selectedBot?.id === bot.id ? "border-sky-500 bg-sky-500/20" : "border-white/10 hover:border-white/30 bg-white/5"
                    )}
                  >
                    <div className="font-black text-xl mb-1 uppercase italic">{bot.name}</div>
                    <div className="text-sm font-bold text-sky-400 uppercase tracking-widest">{bot.elo} ELO</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-20 flex justify-center">
              <button 
                onClick={() => {
                  playSound('click');
                  if (selectedBot) setView('game');
                  else startMatchmaking();
                }}
                disabled={isSearching}
                className="px-20 py-6 bg-sky-500 hover:bg-sky-400 disabled:bg-sky-500/50 text-white rounded-[2rem] font-black text-3xl shadow-[0_0_50px_rgba(14,165,233,0.4)] transition-all flex items-center gap-6 active:scale-95 uppercase italic tracking-tighter"
              >
                {isSearching ? (
                  <>
                    <Loader2 className="w-10 h-10 animate-spin" /> ПОИСК...
                  </>
                ) : (
                  selectedBot ? "ИГРАТЬ С БОТОМ" : "В БОЙ ОНЛАЙН!"
                )}
              </button>
            </div>
          </motion.div>
        )}

        {view === 'admin' && isAdmin && (
          <motion.div 
            key="admin"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="max-w-4xl mx-auto p-8 pt-16"
          >
            <button onClick={() => { setView('menu'); playSound('click'); }} className="mb-8 flex items-center gap-2 font-black text-yellow-400 hover:text-yellow-300 uppercase tracking-widest">
              <ArrowLeft className="w-5 h-5" /> Назад в меню
            </button>
            
            <div className="bg-white/5 backdrop-blur-xl p-8 rounded-[3rem] border border-white/10 shadow-2xl">
              <div className="flex items-center gap-4 mb-8">
                <ShieldAlert className="w-10 h-10 text-yellow-400" />
                <h2 className="text-4xl font-black italic tracking-tighter uppercase">Админ Панель</h2>
              </div>

              <div className="space-y-6">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                  <input 
                    type="text" 
                    placeholder="Поиск игрока..." 
                    value={adminSearch}
                    onChange={(e) => setAdminSearch(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white font-bold focus:border-yellow-400 outline-none transition-all"
                  />
                </div>

                <div className="grid grid-cols-1 gap-4">
                  {adminUsers
                    .filter(u => u.displayName.toLowerCase().includes(adminSearch.toLowerCase()))
                    .map(u => (
                    <div key={u.uid} className="flex items-center justify-between bg-white/5 p-4 rounded-2xl border border-white/10">
                      <div className="flex items-center gap-4">
                        <img src={u.photoURL} className="w-12 h-12 rounded-full border-2 border-white/20" alt="" />
                        <div>
                          <div className="font-black">{u.displayName}</div>
                          <div className="text-xs text-white/40 uppercase tracking-widest">{u.elo} ELO</div>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button 
                          onClick={() => updateEloAdmin(u.uid, -500)}
                          className="p-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-xl border border-red-500/20 transition-all text-xs font-black"
                        >
                          -500
                        </button>
                        <button 
                          onClick={() => updateEloAdmin(u.uid, -100)}
                          className="p-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-xl border border-red-500/20 transition-all text-xs font-black"
                        >
                          -100
                        </button>
                        <button 
                          onClick={() => updateEloAdmin(u.uid, 100)}
                          className="p-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 rounded-xl border border-emerald-500/20 transition-all text-xs font-black"
                        >
                          +100
                        </button>
                        <button 
                          onClick={() => updateEloAdmin(u.uid, 500)}
                          className="p-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 rounded-xl border border-emerald-500/20 transition-all text-xs font-black"
                        >
                          +500
                        </button>
                        <button 
                          onClick={() => toggleBanAdmin(u.uid, !!u.isBanned)}
                          className={cn(
                            "px-4 py-2 rounded-xl font-black text-xs transition-all border",
                            u.isBanned ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/20" : "bg-red-500/20 text-red-400 border-red-500/20"
                          )}
                        >
                          {u.isBanned ? "РАЗБАНИТЬ" : "БАН"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
        {view === 'leaderboard' && (
          <Leaderboard onBack={() => { setView('menu'); playSound('click'); }} />
        )}

        {view === 'game' && (
          <GameView 
            user={user} 
            profile={profile!} 
            selectedChar={selectedChar} 
            bot={selectedBot}
            onExit={() => {
              setView('menu');
              setSelectedBot(null);
              playSound('click');
            }} 
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string, value: number, color: string }) {
  return (
    <div className="bg-white/5 p-6 rounded-3xl border border-white/10 text-center backdrop-blur-sm">
      <div className={cn("text-4xl font-black mb-1 italic tracking-tighter", color)}>{value}</div>
      <div className="text-xs font-bold uppercase tracking-[0.2em] text-white/40">{label}</div>
    </div>
  );
}

function StatBar({ label, value, max, icon }: { label: string, value: number, max: number, icon: React.ReactNode }) {
  const percentage = (value / max) * 100;
  return (
    <div className="text-left">
      <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-white/40 mb-2">
        <span className="flex items-center gap-1.5">{icon} {label}</span>
        <span>{Math.round(percentage)}%</span>
      </div>
      <div className="h-2.5 bg-white/10 rounded-full overflow-hidden p-0.5">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          className="h-full bg-sky-500 rounded-full shadow-[0_0_10px_rgba(14,165,233,0.5)]"
        />
      </div>
    </div>
  );
}

function Leaderboard({ onBack }: { onBack: () => void }) {
  const [leaders, setLeaders] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'users'), orderBy('elo', 'desc'), limit(20));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => doc.data() as UserProfile);
      setLeaders(data);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  return (
    <motion.div 
      key="leaderboard"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="max-w-3xl mx-auto p-8 pt-16"
    >
      <button onClick={onBack} className="mb-12 flex items-center gap-3 font-black text-sky-400 hover:text-sky-300 text-xl uppercase tracking-widest group">
        <ArrowLeft className="w-6 h-6 group-hover:-translate-x-2 transition-transform" /> НАЗАД
      </button>
      
      <h2 className="text-6xl font-black mb-16 text-center italic tracking-tighter uppercase flex items-center justify-center gap-6">
        <Trophy className="w-16 h-16 text-yellow-400 drop-shadow-[0_0_15px_rgba(250,204,21,0.3)]" /> ТОП ИГРОКОВ
      </h2>

      <div className="bg-white/5 rounded-[3rem] shadow-2xl overflow-hidden border border-white/10 backdrop-blur-md">
        {loading ? (
          <div className="p-20 text-center"><Loader2 className="w-12 h-12 animate-spin mx-auto text-sky-400" /></div>
        ) : (
          <div className="divide-y divide-white/5">
            {leaders.map((leader, index) => (
              <motion.div 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                key={leader.uid} 
                className="flex items-center gap-6 p-6 hover:bg-white/5 transition-colors"
              >
                <div className={cn(
                  "w-12 h-12 flex items-center justify-center rounded-2xl font-black text-2xl italic",
                  index === 0 ? "bg-yellow-400 text-sky-950 shadow-[0_0_20px_rgba(250,204,21,0.4)]" : 
                  index === 1 ? "bg-slate-300 text-sky-950" :
                  index === 2 ? "bg-orange-400 text-sky-950" : "bg-white/10 text-white/40"
                )}>
                  {index + 1}
                </div>
                <img src={leader.photoURL || 'https://picsum.photos/seed/user/100/100'} className="w-16 h-16 rounded-full border-4 border-white/10 shadow-lg" alt="Avatar" />
                <div className="flex-1">
                  <div className="font-black text-2xl tracking-tight">{leader.displayName}</div>
                  <div className="text-xs font-bold text-white/40 uppercase tracking-[0.2em] mt-1">{leader.wins}W / {leader.losses}L</div>
                </div>
                <div className="text-4xl font-black text-sky-400 italic tracking-tighter">{leader.elo}</div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function GameView({ user, profile, selectedChar, bot, onExit }: { user: any, profile: UserProfile, selectedChar: Character, bot: Bot | null, onExit: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastUpdateRef = useRef(0);
  const [match, setMatch] = useState<Match | null>(null);
  const [isPlayer1, setIsPlayer1] = useState(true);
  const [gameOver, setGameOver] = useState(false);
  const [winner, setWinner] = useState<string | null>(null);
  const [goalScored, setGoalScored] = useState<string | null>(null);
  const [localScores, setLocalScores] = useState({ p1: 0, p2: 0 });
  const [timeLeft, setTimeLeft] = useState(120); // 2 minutes
  const [isPaused, setIsPaused] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);

  const ballRef = useRef({ x: FIELD_WIDTH / 2, y: FIELD_HEIGHT / 2, vx: 3, vy: 3 });
  const p1Ref = useRef({ x: 150, y: FIELD_HEIGHT / 2 });
  const p2Ref = useRef({ x: FIELD_WIDTH - 150, y: FIELD_HEIGHT / 2 });
  const scoresRef = useRef({ p1: 0, p2: 0 });

  const resetPositions = async () => {
    const newBall = { 
      x: FIELD_WIDTH / 2, 
      y: FIELD_HEIGHT / 2, 
      vx: (Math.random() > 0.5 ? 1 : -1) * 5, 
      vy: (Math.random() > 0.5 ? 1 : -1) * 5 
    };
    const newP1 = { x: 150, y: FIELD_HEIGHT / 2 };
    const newP2 = { x: FIELD_WIDTH - 150, y: FIELD_HEIGHT / 2 };
    
    ballRef.current = newBall;
    p1Ref.current = newP1;
    p2Ref.current = newP2;

    if (!bot && match && isPlayer1) {
      await updateDoc(doc(db, 'matches', match.id), {
        ballPos: newBall,
        player1Pos: newP1,
        player2Pos: newP2,
        updatedAt: serverTimestamp()
      });
    }
  };

  const startCountdown = () => {
    setCountdown(3);
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev === 1) {
          clearInterval(interval);
          setIsPaused(false);
          return null;
        }
        return prev ? prev - 1 : null;
      });
    }, 1000);
  };

  const handleWin = async (winnerId: string) => {
    if (gameOver) return;
    setGameOver(true);
    setWinner(winnerId);
    if (winnerId === user.uid) playSound('win'); else playSound('lose');
    
    if (!bot && match) {
      if (isPlayer1) {
        await updateDoc(doc(db, 'matches', match.id), { status: 'finished', winner: winnerId, updatedAt: serverTimestamp() });
        const p1RefDoc = doc(db, 'users', match.player1);
        const p2RefDoc = doc(db, 'users', match.player2!);
        const p1Snap = await getDoc(p1RefDoc);
        const p2Snap = await getDoc(p2RefDoc);
        if (p1Snap.exists() && p2Snap.exists()) {
          const p1Data = p1Snap.data() as UserProfile;
          const p2Data = p2Snap.data() as UserProfile;
          const { newWinnerElo, newLoserElo } = calculateElo(
            winnerId === match.player1 ? p1Data.elo : p2Data.elo,
            winnerId === match.player1 ? p2Data.elo : p1Data.elo
          );
          await updateDoc(p1RefDoc, {
            elo: winnerId === match.player1 ? newWinnerElo : newLoserElo,
            wins: winnerId === match.player1 ? p1Data.wins + 1 : p1Data.wins,
            losses: winnerId === match.player1 ? p1Data.losses : p1Data.losses + 1
          });
          await updateDoc(p2RefDoc, {
            elo: winnerId === match.player2 ? newWinnerElo : newLoserElo,
            wins: winnerId === match.player2 ? p2Data.wins + 1 : p2Data.wins,
            losses: winnerId === match.player2 ? p2Data.losses : p2Data.losses + 1
          });
        }
      }
    } else if (bot) {
      const pRef = doc(db, 'users', user.uid);
      if (winnerId === user.uid) {
        await updateDoc(pRef, { wins: profile.wins + 1, elo: profile.elo + 10 });
      } else if (winnerId !== 'draw') {
        await updateDoc(pRef, { losses: profile.losses + 1, elo: Math.max(0, profile.elo - 5) });
      }
    }
  };

  useEffect(() => {
    if (bot) {
      const botMatch: Match = {
        id: 'bot_match',
        player1: user.uid,
        player2: bot.id,
        player1Char: selectedChar.id,
        player2Char: bot.charId,
        player1Score: 0,
        player2Score: 0,
        status: 'playing',
        ballPos: { x: FIELD_WIDTH / 2, y: FIELD_HEIGHT / 2, vx: 3, vy: 3 },
        player1Pos: { x: 150, y: FIELD_HEIGHT / 2 },
        player2Pos: { x: FIELD_WIDTH - 150, y: FIELD_HEIGHT / 2 },
        createdAt: new Date(),
        updatedAt: new Date()
      };
      setMatch(botMatch);
      setIsPlayer1(true);
      ballRef.current = { ...botMatch.ballPos };
      p1Ref.current = { ...botMatch.player1Pos };
      p2Ref.current = { ...botMatch.player2Pos };
      return;
    }

    const q = query(collection(db, 'matches'), where('status', 'in', ['waiting', 'playing']), where('player1', '==', user.uid));
    const q2 = query(collection(db, 'matches'), where('status', '==', 'playing'), where('player2', '==', user.uid));

    const unsub1 = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        const data = snap.docs[0].data() as Match;
        const matchId = snap.docs[0].id;
        setMatch(prev => (!prev || prev.status !== data.status || prev.player1Score !== data.player1Score || prev.player2Score !== data.player2Score) ? { id: matchId, ...data } : prev);
        setIsPlayer1(true);
        if (data.status === 'playing') {
          p2Ref.current = data.player2Pos;
          if (Math.abs(scoresRef.current.p1 - data.player1Score) > 0 || Math.abs(scoresRef.current.p2 - data.player2Score) > 0) {
            scoresRef.current = { p1: data.player1Score, p2: data.player2Score };
            setLocalScores({ p1: data.player1Score, p2: data.player2Score });
          }
        }
      }
    });

    const unsub2 = onSnapshot(q2, (snap) => {
      if (!snap.empty) {
        const data = snap.docs[0].data() as Match;
        const matchId = snap.docs[0].id;
        setMatch(prev => (!prev || prev.status !== data.status || prev.player1Score !== data.player1Score || prev.player2Score !== data.player2Score) ? { id: matchId, ...data } : prev);
        setIsPlayer1(false);
        ballRef.current = data.ballPos;
        p1Ref.current = data.player1Pos;
        scoresRef.current = { p1: data.player1Score, p2: data.player2Score };
        setLocalScores({ p1: data.player1Score, p2: data.player2Score });
      }
    });

    return () => { unsub1(); unsub2(); };
  }, [user?.uid, bot, selectedChar.id]);

  // Timer effect
  useEffect(() => {
    if (!match || match.status !== 'playing' || gameOver || isPaused) return;
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          const winId = scoresRef.current.p1 > scoresRef.current.p2 ? match.player1 : 
                        (scoresRef.current.p2 > scoresRef.current.p1 ? (bot ? bot.id : match.player2!) : null);
          if (winId) handleWin(winId);
          else handleWin('draw');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [match?.status, gameOver, isPaused, bot]);

  useEffect(() => {
    if (!match || match.status !== 'playing' || gameOver || isPaused) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const update = () => {
      const ball = ballRef.current;
      const p1 = p1Ref.current;
      const p2 = p2Ref.current;

      if (isPlayer1 || bot) {
        ball.x += ball.vx;
        ball.y += ball.vy;

        const minVel = 2.0;
        if (Math.abs(ball.vx) < minVel) ball.vx = ball.vx < 0 ? -minVel : minVel;
        if (Math.abs(ball.vy) < minVel) ball.vy = ball.vy < 0 ? -minVel : minVel;

        // Better wall collisions to prevent sticking
        if (ball.y < 25) { 
          ball.vy = Math.abs(ball.vy); 
          ball.y = 26; 
          playSound('hit'); 
        }
        if (ball.y > FIELD_HEIGHT - 25) { 
          ball.vy = -Math.abs(ball.vy); 
          ball.y = FIELD_HEIGHT - 26; 
          playSound('hit'); 
        }

        // Goal post collisions
        const checkPost = (x: number, y: number) => {
          const dx = ball.x - x;
          const dy = ball.y - y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 25) {
            const angle = Math.atan2(dy, dx);
            ball.vx = Math.cos(angle) * 5;
            ball.vy = Math.sin(angle) * 5;
            ball.x = x + Math.cos(angle) * 26;
            ball.y = y + Math.sin(angle) * 26;
            playSound('hit');
          }
        };

        checkPost(0, GOAL_Y);
        checkPost(0, GOAL_Y + GOAL_SIZE);
        checkPost(FIELD_WIDTH, GOAL_Y);
        checkPost(FIELD_WIDTH, GOAL_Y + GOAL_SIZE);
        
        if (ball.x < 0) {
          if (ball.y > GOAL_Y && ball.y < GOAL_Y + GOAL_SIZE) {
            scoresRef.current.p2++;
            setLocalScores(prev => ({ ...prev, p2: scoresRef.current.p2 }));
            setGoalScored('ГОЛ! ИГРОК 2');
            playSound('goal');
            setIsPaused(true);
            setTimeout(async () => {
              await resetPositions();
              setGoalScored(null);
              startCountdown();
            }, 2000);
          } else {
            ball.vx = Math.abs(ball.vx);
            ball.x = 1; // Push away
            playSound('hit');
          }
        }
        if (ball.x > FIELD_WIDTH) {
          if (ball.y > GOAL_Y && ball.y < GOAL_Y + GOAL_SIZE) {
            scoresRef.current.p1++;
            setLocalScores(prev => ({ ...prev, p1: scoresRef.current.p1 }));
            setGoalScored('ГОЛ! ИГРОК 1');
            playSound('goal');
            setIsPaused(true);
            setTimeout(async () => {
              await resetPositions();
              setGoalScored(null);
              startCountdown();
            }, 2000);
          } else {
            ball.vx = -Math.abs(ball.vx);
            ball.x = FIELD_WIDTH - 1; // Push away
            playSound('hit');
          }
        }

        if (bot) {
          const botChar = CHARACTERS.find(c => c.id === bot.charId) || CHARACTERS[0];
          const botSpeed = 3.5 * botChar.speed * (bot.difficulty === 'hard' ? 1.6 : bot.difficulty === 'medium' ? 1.1 : 0.7);
          if (p2.y < ball.y - 10) p2.y += botSpeed;
          else if (p2.y > ball.y + 10) p2.y -= botSpeed;
          const targetX = Math.max(FIELD_WIDTH / 2 + 50, Math.min(FIELD_WIDTH - 50, ball.x + 60));
          if (p2.x < targetX - 10) p2.x += botSpeed;
          else if (p2.x > targetX + 10) p2.x -= botSpeed;
          p2.y = Math.max(30, Math.min(FIELD_HEIGHT - 30, p2.y));
          p2.x = Math.max(FIELD_WIDTH / 2 + 20, Math.min(FIELD_WIDTH - 30, p2.x));
        }

        const checkCollision = (p: { x: number, y: number }, charId: string) => {
          const char = CHARACTERS.find(c => c.id === charId) || CHARACTERS[0];
          const radius = 35 * char.size;
          const dx = ball.x - p.x;
          const dy = ball.y - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < radius + 15) {
            playSound('hit');
            const angle = Math.atan2(dy, dx);
            const speed = 10 * char.power;
            ball.vx = Math.cos(angle) * speed;
            ball.vy = Math.sin(angle) * speed;
            ball.x = p.x + Math.cos(angle) * (radius + 16);
            ball.y = p.y + Math.sin(angle) * (radius + 16);
          }
        };

        checkCollision(p1, match.player1Char || 'korzhik');
        checkCollision(p2, match.player2Char || 'korzhik');

        if (!bot && Math.random() > 0.9) {
          updateDoc(doc(db, 'matches', match.id), {
            ballPos: ball,
            player1Score: scoresRef.current.p1,
            player2Score: scoresRef.current.p2,
            updatedAt: serverTimestamp()
          });
        }

        if (scoresRef.current.p1 >= 5 || scoresRef.current.p2 >= 5) {
          const winId = scoresRef.current.p1 >= 5 ? match.player1 : (bot ? bot.id : match.player2!);
          handleWin(winId);
        }
      }

      ctx.clearRect(0, 0, FIELD_WIDTH, FIELD_HEIGHT);
      
      // Ice Texture
      ctx.fillStyle = '#e0f2fe';
      ctx.fillRect(0, 0, FIELD_WIDTH, FIELD_HEIGHT);
      ctx.strokeStyle = '#bae6fd';
      ctx.lineWidth = 1;
      for(let i=0; i<30; i++) {
        ctx.beginPath();
        ctx.moveTo(Math.random()*FIELD_WIDTH, Math.random()*FIELD_HEIGHT);
        ctx.lineTo(Math.random()*FIELD_WIDTH, Math.random()*FIELD_HEIGHT);
        ctx.stroke();
      }

      // Markings
      ctx.strokeStyle = 'rgba(14,165,233,0.3)';
      ctx.lineWidth = 8;
      ctx.beginPath(); ctx.moveTo(FIELD_WIDTH / 2, 0); ctx.lineTo(FIELD_WIDTH / 2, FIELD_HEIGHT); ctx.stroke();
      ctx.beginPath(); ctx.arc(FIELD_WIDTH / 2, FIELD_HEIGHT / 2, 100, 0, Math.PI * 2); ctx.stroke();
      
      // Goals
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillRect(0, GOAL_Y, 15, GOAL_SIZE);
      ctx.fillRect(FIELD_WIDTH - 15, GOAL_Y, 15, GOAL_SIZE);
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 4;
      ctx.strokeRect(0, GOAL_Y, 15, GOAL_SIZE);
      ctx.strokeRect(FIELD_WIDTH - 15, GOAL_Y, 15, GOAL_SIZE);

      // Puck Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.1)';
      ctx.beginPath(); ctx.arc(ball.x + 4, ball.y + 4, 15, 0, Math.PI * 2); ctx.fill();

      // Puck
      ctx.fillStyle = '#1e293b';
      ctx.beginPath(); ctx.arc(ball.x, ball.y, 15, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 2;
      ctx.stroke();

      const drawPlayer = (p: { x: number, y: number }, charId: string, label: string, isMe: boolean) => {
        const char = CHARACTERS.find(c => c.id === charId) || CHARACTERS[0];
        const radius = 35 * char.size;
        
        ctx.fillStyle = 'rgba(0,0,0,0.1)';
        ctx.beginPath(); ctx.arc(p.x + 5, p.y + 5, radius, 0, Math.PI * 2); ctx.fill();

        ctx.fillStyle = char.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, radius, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = isMe ? '#fff' : 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 4;
        ctx.stroke();
        
        ctx.fillStyle = isMe ? '#fff' : 'rgba(255,255,255,0.7)';
        ctx.font = 'black 16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(label.toUpperCase(), p.x, p.y - radius - 15);

        // Character Icon Placeholder
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.beginPath(); ctx.arc(p.x, p.y, radius * 0.6, 0, Math.PI * 2); ctx.fill();
      };

      drawPlayer(p1, match.player1Char || 'korzhik', isPlayer1 ? "ВЫ" : "Игрок 1", isPlayer1);
      drawPlayer(p2, match.player2Char || 'korzhik', !isPlayer1 ? "ВЫ" : (bot ? bot.name : "Игрок 2"), !isPlayer1);

      animationFrameId = requestAnimationFrame(update);
    };

    update();
    return () => cancelAnimationFrame(animationFrameId);
  }, [match?.id, match?.status, isPlayer1, gameOver, bot, isPaused, countdown]);

  useEffect(() => {
    if (!match || match.status !== 'playing' || gameOver) return;
    const handleMouseMove = (e: MouseEvent) => {
      if (gameOver || isPaused || countdown !== null) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const scaleY = FIELD_HEIGHT / rect.height;
      const scaleX = FIELD_WIDTH / rect.width;
      const y = (e.clientY - rect.top) * scaleY;
      const x = (e.clientX - rect.left) * scaleX;
      
      const char = CHARACTERS.find(c => c.id === (isPlayer1 ? match.player1Char : match.player2Char)) || CHARACTERS[0];
      const radius = 35 * char.size;
      
      const constrainedY = Math.max(radius, Math.min(FIELD_HEIGHT - radius, y));
      const constrainedX = isPlayer1 
        ? Math.max(radius, Math.min(FIELD_WIDTH / 2 - 50, x)) 
        : Math.max(FIELD_WIDTH / 2 + 50, Math.min(FIELD_WIDTH - radius, x));

      if (isPlayer1) p1Ref.current = { x: constrainedX, y: constrainedY };
      else p2Ref.current = { x: constrainedX, y: constrainedY };

      if (!bot) {
        const now = Date.now();
        if (now - lastUpdateRef.current > 40) {
          const posKey = isPlayer1 ? 'player1Pos' : 'player2Pos';
          updateDoc(doc(db, 'matches', match.id), { [posKey]: { x: constrainedX, y: constrainedY }, updatedAt: serverTimestamp() });
          lastUpdateRef.current = now;
        }
      }
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [match?.id, match?.status, isPlayer1, gameOver, bot]);

  return (
    <div className="fixed inset-0 bg-sky-950 flex flex-col items-center justify-center p-4 z-50 overflow-hidden">
      <div className="w-full max-w-5xl flex justify-between items-center mb-8 text-white">
        <div className="flex items-center gap-8 bg-white/5 p-4 rounded-3xl border border-white/10 backdrop-blur-md">
          <div className="text-center">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 mb-1">Игрок 1</div>
            <div className="text-6xl font-black italic tracking-tighter text-sky-400">{localScores.p1}</div>
          </div>
          <div className="h-12 w-px bg-white/10" />
          <div className="text-center">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 mb-1">Игрок 2</div>
            <div className="text-6xl font-black italic tracking-tighter text-red-400">{localScores.p2}</div>
          </div>
        </div>
        
        <div className="flex flex-col items-center">
          <div className="text-2xl font-black bg-white/10 px-10 py-3 rounded-full border border-white/20 italic tracking-tighter uppercase animate-pulse">
            {match?.status === 'waiting' ? "ОЖИДАНИЕ..." : "МАТЧ ИДЕТ"}
          </div>
        </div>

        <div className="flex gap-4">
          <div className="bg-white/5 p-4 rounded-3xl border border-white/10 text-center min-w-[120px]">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 mb-1">ВРЕМЯ</div>
            <div className="text-2xl font-black italic">
              {Math.floor(timeLeft / 60).toString().padStart(2, '0')}:{(timeLeft % 60).toString().padStart(2, '0')}
            </div>
          </div>
        </div>
      </div>

      <div className="relative bg-sky-300 rounded-[3rem] border-[12px] border-white/10 shadow-[0_0_100px_rgba(0,0,0,0.5)] overflow-hidden cursor-none" style={{ width: `${FIELD_WIDTH}px`, height: `${FIELD_HEIGHT}px`, maxWidth: '95vw', maxHeight: '70vh' }}>
        <canvas ref={canvasRef} width={FIELD_WIDTH} height={FIELD_HEIGHT} className="w-full h-full object-contain" />
        
        <AnimatePresence>
          {goalScored && (
            <motion.div 
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1.2, opacity: 1 }}
              exit={{ scale: 2, opacity: 0 }}
              className="absolute inset-0 flex items-center justify-center pointer-events-none z-40"
            >
              <div className="bg-yellow-400 text-sky-950 px-16 py-6 rounded-[2rem] font-black text-7xl italic tracking-tighter shadow-[0_0_100px_rgba(250,204,21,0.5)] border-8 border-white">
                ГОООООЛ!
                <div className="text-2xl mt-2 text-center opacity-70">{goalScored}</div>
              </div>
            </motion.div>
          )}

          {countdown !== null && (
            <motion.div 
              key={countdown}
              initial={{ scale: 2, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none"
            >
              <div className="text-white font-black text-9xl drop-shadow-[0_10px_10px_rgba(0,0,0,0.5)] italic">
                {countdown}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {match?.status === 'waiting' && (
          <div className="absolute inset-0 bg-sky-950/80 backdrop-blur-md flex flex-col items-center justify-center text-white text-center p-12">
            <Loader2 className="w-24 h-24 animate-spin mb-8 text-sky-400" />
            <h2 className="text-5xl font-black mb-4 uppercase italic tracking-tighter">Ждем соперника</h2>
            <p className="text-xl opacity-60 max-w-md font-bold">Позови друга или подожди, пока кто-то зайдет в онлайн!</p>
            <button 
              onClick={() => { onExit(); playSound('click'); }}
              className="mt-12 px-12 py-5 bg-white/10 hover:bg-white/20 rounded-2xl font-black text-2xl transition-all border border-white/20 uppercase italic tracking-tighter"
            >
              Выйти в меню
            </button>
          </div>
        )}

        <AnimatePresence>
          {gameOver && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="absolute inset-0 bg-sky-950/90 backdrop-blur-xl flex flex-col items-center justify-center text-white text-center p-12 z-50"
            >
              <div className="relative mb-12">
                <Trophy className={cn("w-32 h-32 drop-shadow-[0_0_30px_rgba(250,204,21,0.5)]", winner === user.uid ? "text-yellow-400" : "text-slate-400")} />
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 10, repeat: Infinity, ease: "linear" }} className="absolute -inset-8 border-4 border-dashed border-white/10 rounded-full" />
              </div>
              <h2 className="text-7xl font-black mb-4 uppercase italic tracking-tighter">
                {winner === user.uid ? "ТЫ ПОБЕДИЛ!" : "ПОРАЖЕНИЕ"}
              </h2>
              <p className="text-2xl opacity-60 mb-16 font-bold uppercase tracking-widest">
                {winner === user.uid ? "Отличная игра, чемпион!" : "Не вешай нос, в следующий раз получится!"}
              </p>
              <button 
                onClick={() => { onExit(); playSound('click'); }}
                className="px-16 py-6 bg-sky-500 hover:bg-sky-400 text-white rounded-[2rem] font-black text-3xl shadow-[0_0_50px_rgba(14,165,233,0.4)] transition-all active:scale-95 uppercase italic tracking-tighter"
              >
                ВЕРНУТЬСЯ В МЕНЮ
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="mt-12 flex gap-12 text-white/30 text-sm font-black uppercase tracking-[0.3em]">
        <div className="flex items-center gap-3"><Move className="w-5 h-5" /> Двигай мышкой</div>
        <div className="flex items-center gap-3"><Zap className="w-5 h-5" /> Бей по шайбе</div>
        <div className="flex items-center gap-3"><Trophy className="w-5 h-5" /> Забей 5 голов</div>
      </div>
    </div>
  );
}
