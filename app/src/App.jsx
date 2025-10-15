import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';
// Importing icons from Lucide for a modern look.
import { Calendar, Activity, UserPlus, Loader2, Clock, MapPin, AlertCircle, X, CheckCircle } from 'lucide-react';

// --- Firebase Imports (Only Firestore needed) ---
import { initializeApp } from 'firebase/app';
// IMPORTANT: Added doc and onSnapshot for real-time status and count updates
import { getAuth, GoogleAuthProvider, signInWithRedirect, getRedirectResult, signOut } from 'firebase/auth';
import { getFirestore, addDoc, collection, serverTimestamp, connectFirestoreEmulator, doc, onSnapshot } from 'firebase/firestore';

// --- Configuration ---
// This is the specific Firebase Web App configuration provided by the user.
const firebaseConfig = {
	apiKey: "AIzaSyAJMDUbxNCqRwaKqeZBBibADKwjULjCXZc",
	authDomain: "pingpongclub-47680.firebaseapp.com",
	projectId: "pingpongclub-47680",
	storageBucket: "pingpongclub-47680.firebasestorage.app",
	messagingSenderId: "935778736221",
	appId: "1:935778736221:web:b44e68c1ff918f59b355b4",
	measurementId: "G-0FR63Q2KSC"
};

// Google Calendar API public key and calendar ID (for reading events)
const API_KEY = "AIzaSyC3YHsOFyTGJSbA_cUQt1IVFMK_4EdbNkw";
// UPDATED CALENDAR_ID: This should resolve the 404 error
const CALENDAR_ID = "609af22732183c58b3b73f2d0239907e78b56a625aac5a5177852f6dd896f997@group.calendar.google.com";

// --- Context for Firebase and User Data ---
const FirebaseContext = createContext({
	db: null,
	sessionUserId: null,
	auth: null,
	adminUser: null,
	isAdminLoading: true,
});

// --- Firebase Initialization and DB Provider (Auth Removed) ---
const FirebaseProvider = ({ children }) => {
	const [db, setDb] = useState(null);
	// Generate a unique session ID once when the provider mounts
	const [sessionUserId] = useState(crypto.randomUUID());
	const [isDbReady, setIsDbReady] = useState(false);
	const [auth, setAuth] = useState(null); // NEW: Auth state
	const [adminUser, setAdminUser] = useState(null); // NEW: Authenticated admin user
	const [isAdminLoading, setIsAdminLoading] = useState(true);

	useEffect(() => {
		try {
			const app = initializeApp(firebaseConfig);
			const firestoreDb = getFirestore(app);

			const firebaseAuth = getAuth(app); // NEW: Initialize Auth
			// --- Emulator Connection Check ---
			if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
				console.log("Connecting to Firestore emulator at localhost:8080");
				connectFirestoreEmulator(firestoreDb, 'localhost', 8080);
			}

			setAuth(firebaseAuth); // NEW: Set Auth state
			setDb(firestoreDb);
			setIsDbReady(true);
		} catch (e) {
			console.error("Firebase initialization failed:", e);
		}
	}, []);
	// NEW: Check if the authenticated user is a whitelisted Admin
	useEffect(() => {
		if (!auth || !db) return;

		// Listener for Auth state changes (login/logout)
		const unsubscribeAuth = auth.onAuthStateChanged(async (user) => {
			if (user) {
				// Check if user's email exists in the 'admins' collection
				const adminRef = doc(db, 'admins', user.email);
				const adminSnap = await getDoc(adminRef);

				if (adminSnap.exists()) {
					setAdminUser(user);
				} else {
					// Not a whitelisted admin, sign them out
					await signOut(auth);
					setAdminUser(null);
				}
			} else {
				setAdminUser(null);
			}
			setIsAdminLoading(false);
		});

		return () => unsubscribeAuth();
	}, [auth, db]);

	// INSIDE FirebaseProvider component:

	// This logic runs regardless of whether the user signed in via Email Link, Google, etc.
	useEffect(() => {
		if (!auth || !db) return;

		const unsubscribeAuth = auth.onAuthStateChanged(async (user) => {
			// ... (previous logic)
			if (user) {
				// Check if user's email exists in the 'admins' collection
				const adminRef = doc(db, 'admins', user.email);
				const adminSnap = await getDoc(adminRef);

				// 🛑 Check the console output for these lines 🛑
				console.log("AUTH: Logged in user email:", user.email);
				console.log("AUTH: Whitelist check document ID:", user.email);
				console.log("AUTH: Whitelist document exists:", adminSnap.exists());
				if (adminSnap.exists()) {
					setAdminUser(user);
				} else {
					// Not a whitelisted admin, sign them out immediately
					await signOut(auth);
					setAdminUser(null);
				}
			} else {
				setAdminUser(null);
			}
			setIsAdminLoading(false);
		});

		return () => unsubscribeAuth();
	}, [auth, db]);
	// Providing the database instance and the unique session ID
	return (
		<FirebaseContext.Provider value={{ db, sessionUserId, isDbReady, auth, adminUser, isAdminLoading }}>
			{children}
		</FirebaseContext.Provider>
	);
};

// Custom hook to use Firebase context
const useFirebase = () => useContext(FirebaseContext);

// --- Admin Components ---

const ACTION_CODE_SETTINGS = {
	// URL to redirect back to the app (must be registered in Firebase Console)
	url: window.location.href,
	handleCodeInApp: true,
};

// --- Admin Authentication Component (using Google) ---
const AdminAuth = () => {
	// Get the auth service from your context
	const { auth } = useFirebase();
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState(null);

	// ------------------------------------------------------------------
	// A. HANDLE REDIRECT RESULT (Runs on every page load)
	// ------------------------------------------------------------------
	useEffect(() => {
		const checkRedirectResult = async () => {
			if (!auth) return;

			setIsLoading(true);
			setError(null);

			try {
				// This checks if the user was just redirected back after a successful Google login.
				const result = await getRedirectResult(auth);

				if (result) {
					// Sign-in successful. 
					// The user is now authenticated and the FirebaseProvider 
					// will automatically check the Firestore 'admins' whitelist.
					console.log("Google redirect sign-in successful. Whitelist check next...");
				}

			} catch (authError) {
				console.error("Error handling redirect result:", authError);
				setError("Login failed after redirect. Please try again.");
				// You can add more specific error handling here if needed.
			} finally {
				setIsLoading(false);
			}
		};

		checkRedirectResult();
	}, [auth]); // Run only when the auth service is available

	// ------------------------------------------------------------------
	// B. INITIATE SIGN-IN (Runs when the button is clicked)
	// ------------------------------------------------------------------
	const handleGoogleSignIn = async () => {
		if (!auth) {
			setError("Authentication service not ready.");
			return;
		}

		// This will redirect the user away from your application
		setIsLoading(true);
		setError(null);

		try {
			const provider = new GoogleAuthProvider();
			await signInWithRedirect(auth, provider);
			// NOTE: Code execution STOPS here as the browser redirects.

		} catch (authError) {
			console.error("Google Sign-In Initiation Error:", authError);
			setError("Failed to start the sign-in process.");
			setIsLoading(false);
		}
	};

	// ------------------------------------------------------------------
	// C. RENDER UI
	// ------------------------------------------------------------------
	return (
		<div className="max-w-md mx-auto p-8 bg-gray-800 rounded-2xl shadow-xl border border-indigo-700/50">
			<h3 className="text-2xl font-bold text-indigo-400 mb-6">Admin Sign In</h3>

			{error && (
				<div className="bg-red-900/50 text-red-300 p-3 rounded-lg mb-4 flex items-center">
					{/* <AlertCircle className="w-5 h-5 mr-2" /> */}
					{error}
				</div>
			)}

			<button
				onClick={handleGoogleSignIn}
				disabled={isLoading}
				className={`w-full py-3 rounded-lg font-semibold transition duration-200 flex items-center justify-center ${isLoading
					? 'bg-gray-600 text-gray-400 cursor-not-allowed'
					: 'bg-white text-gray-800 hover:bg-gray-100 shadow-lg'
					}`}
			>
				{isLoading ? (
					<>
						{/* <Loader2 className="w-5 h-5 mr-2 animate-spin" /> */}
						Checking Status...
					</>
				) : (
					<>
						{/*  */}
						<span className='ml-2'>Sign In with Google</span>
					</>
				)}
			</button>
			<p className='text-sm text-gray-400 mt-4 text-center'>Only whitelisted emails will be granted admin access.</p>
		</div>
	);
};

const AdminPage = () => {
	const { auth, adminUser, isAdminLoading, db } = useFirebase();
	const [eventCounts, setEventCounts] = useState({});
	const [isLoadingCounts, setIsLoadingCounts] = useState(true);

	// Listener to fetch ALL event counts (this is the same logic as RegistrationPage)
	useEffect(() => {
		if (!db || !adminUser) return; // Only run if DB is ready AND admin is authenticated

		const collectionRef = collection(db, 'event_attendance');

		// This listener fires whenever *any* attendance document changes
		const unsubscribe = onSnapshot(collectionRef, (snapshot) => {
			const newCounts = {};
			snapshot.forEach(docSnap => {
				// The document ID is the event ID (from Google Calendar)
				const eventId = docSnap.id;
				const data = docSnap.data();
				newCounts[eventId] = {
					count: data.count || 0,
					emails: data.emails || []
				};
			});
			setEventCounts(newCounts);
			setIsLoadingCounts(false);
		}, (error) => {
			console.error("Error listening to attendance counts:", error);
			setIsLoadingCounts(false);
		});

		return () => unsubscribe();
	}, [db, adminUser]);

	// Sign out function
	const handleSignOut = () => {
		if (auth) {
			signOut(auth);
			// After sign out, the component will revert to the login screen
		}
	};

	if (isAdminLoading) {
		return (
			<div className="p-4 md:p-8 max-w-7xl mx-auto flex flex-col items-center justify-center min-h-[50vh]">
				<Loader2 className="w-10 h-10 text-indigo-400 animate-spin" />
				<p className="mt-4 text-gray-300 text-lg">Verifying admin credentials...</p>
			</div>
		);
	}

	// If not authenticated, show the login form
	if (!adminUser) {
		return (
			<div className="p-4 md:p-8 max-w-7xl mx-auto">
				<AdminAuth />
			</div>
		);
	}

	// If authenticated, show the admin content
	return (
		<div className="p-4 md:p-8 max-w-7xl mx-auto">
			<div className="flex justify-between items-center mb-6 border-b border-indigo-700/50 pb-4">
				<h2 className="text-4xl font-extrabold text-white flex items-center">
					<AlertCircle className="w-9 h-9 mr-3 text-red-400" /> Admin Dashboard
				</h2>
				<button
					onClick={handleSignOut}
					className="flex items-center space-x-2 px-4 py-2 rounded-lg font-medium bg-red-600 text-white hover:bg-red-500 transition"
				>
					Sign Out ({adminUser.email})
				</button>
			</div>

			<p className="text-lg text-gray-300 mb-8">Real-time attendance summary for all registered events. *Admin Only*</p>

			{isLoadingCounts ? (
				<div className="flex items-center justify-center p-12 bg-gray-800 rounded-xl">
					<Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
					<p className="ml-4 text-gray-300">Loading attendance data...</p>
				</div>
			) : (
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
					{Object.keys(eventCounts).length === 0 ? (
						<p className="text-gray-400 col-span-full">No events have registrations yet.</p>
					) : (
						Object.entries(eventCounts).map(([eventId, data]) => (
							<div key={eventId} className="bg-gray-800 p-6 rounded-xl shadow-lg border border-red-700/50">
								<h3 className="text-xl font-bold text-red-400 mb-3 break-words">{eventId}</h3>
								<p className="text-3xl font-extrabold text-white mb-4">{data.count} Attendees</p>

								<div className='space-y-2 text-sm text-gray-300'>
									<p className='font-semibold mt-4'>Registered Emails:</p>
									<ul className="list-disc list-inside space-y-1 ml-4 h-24 overflow-y-auto bg-gray-900 p-3 rounded-lg">
										{data.emails.map((email, index) => (
											<li key={index} className='truncate'>{email}</li>
										))}
									</ul>
								</div>
							</div>
						))
					)}
				</div>
			)}
		</div>
	);
};

// --- Utility Functions ---

/**
 * Formats an ISO date string (from Google Calendar API) into a readable date and time range.
 */
const formatEventTime = (startDateTime, endDateTime) => {
	const start = new Date(startDateTime);
	const end = new Date(endDateTime);

	const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
	const timeOptions = { hour: 'numeric', minute: '2-digit', hour12: true };

	const formattedDate = start.toLocaleDateString('en-US', dateOptions);
	const formattedStartTime = start.toLocaleTimeString('en-US', timeOptions);
	const formattedEndTime = end.toLocaleTimeString('en-US', timeOptions);

	return {
		date: formattedDate,
		timeRange: `${formattedStartTime} - ${formattedEndTime}`,
	};
};

// --- Components ---

// Modal for Name/Email Input and Firestore Submission
const RegistrationModal = ({ event, onClose, onRegistered }) => {
	const { db, sessionUserId } = useFirebase();
	const [name, setName] = useState('');
	const [email, setEmail] = useState('');
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [submissionError, setSubmissionError] = useState(null);

	const { date, timeRange } = formatEventTime(event.start.dateTime, event.end.dateTime);

	const handleSubmit = async (e) => {
		e.preventDefault();
		if (!db || !sessionUserId) {
			setSubmissionError("Database connection not ready. Please wait.");
			return;
		}

		setIsSubmitting(true);
		setSubmissionError(null);

		try {
			const registrationData = {
				name: name.trim(),
				email: email.trim(),
				selectedEventId: event.id,
				eventName: event.summary,
				registrationDate: serverTimestamp(),
				sessionUserId: sessionUserId,
				// Set initial status for the Cloud Function to process
				attendanceStatus: 'PENDING',
			};

			const collectionPath = `pingpong_registrations`;

			// Capture the document reference to get the ID
			const docRef = await addDoc(collection(db, collectionPath), registrationData);

			// Notify parent component with the event ID AND the new document ID
			onRegistered(event.id, docRef.id);
			onClose();

		} catch (error) {
			console.error("Error writing registration to Firestore: ", error);
			setSubmissionError("Failed to register. Please check your network and try again.");
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<div className="fixed inset-0 z-50 bg-black bg-opacity-70 flex items-center justify-center p-4">
			<div className="bg-gray-800 w-full max-w-lg p-6 rounded-2xl shadow-2xl border border-indigo-700/70 relative">
				<button
					onClick={onClose}
					className="absolute top-4 right-4 text-gray-400 hover:text-white transition"
					aria-label="Close Registration"
				>
					<X className="w-6 h-6" />
				</button>
				<h3 className="text-3xl font-bold text-indigo-400 mb-2">Register for Event</h3>
				<h4 className="text-xl text-white mb-4">{event.summary}</h4>
				<p className="text-sm text-gray-400 mb-6">
					<span className='font-semibold'>{date}</span> at <span className='font-semibold'>{timeRange}</span>
				</p>

				<form onSubmit={handleSubmit} className="space-y-4">
					<div>
						<label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-1">Full Name</label>
						<input
							type="text"
							id="name"
							value={name}
							onChange={(e) => setName(e.target.value)}
							required
							className="w-full p-3 rounded-lg bg-gray-900 text-white border border-gray-700 focus:border-indigo-500 focus:ring focus:ring-indigo-500/50 transition"
							placeholder="John Doe"
						/>
					</div>
					<div>
						<label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-1">Email Address</label>
						<input
							type="email"
							id="email"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							required
							className="w-full p-3 rounded-lg bg-gray-900 text-white border border-gray-700 focus:border-indigo-500 focus:ring focus:ring-indigo-500/50 transition"
							placeholder="john.doe@example.com"
						/>
					</div>

					{submissionError && (
						<div className="bg-red-900/50 text-red-300 p-3 rounded-lg text-sm flex items-center">
							<AlertCircle className="w-4 h-4 mr-2" />
							{submissionError}
						</div>
					)}

					<button
						type="submit"
						disabled={isSubmitting || !name || !email}
						className={`w-full py-3 rounded-lg font-semibold transition duration-200 flex items-center justify-center ${isSubmitting || !name || !email
							? 'bg-indigo-700/50 text-gray-400 cursor-not-allowed'
							: 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-lg hover:shadow-indigo-500/50'
							}`}
					>
						{isSubmitting ? (
							<>
								<Loader2 className="w-5 h-5 mr-2 animate-spin" />
								Submitting...
							</>
						) : (
							"Confirm Registration"
						)}
					</button>
				</form>
			</div>
		</div>
	);
};

// Simple Registration Card for an individual event
const EventCard = ({ event, onRegisterClick, confirmedEvents, pendingSubmissions, currentCount }) => {
	// Check if the current event is confirmed or pending
	const isConfirmed = confirmedEvents.has(event.id);
	const isPending = pendingSubmissions.hasOwnProperty(event.id);
	const isSubmitted = isConfirmed || isPending;

	const { date, timeRange } = formatEventTime(event.start.dateTime, event.end.dateTime);

	let buttonText;
	let buttonClass;

	if (isConfirmed) {
		buttonText = "Registration Complete!";
		buttonClass = 'bg-green-600 text-white cursor-not-allowed flex items-center justify-center';
	} else if (isPending) {
		buttonText = "Processing Submission...";
		buttonClass = 'bg-yellow-600 text-white cursor-not-allowed flex items-center justify-center animate-pulse';
	} else {
		buttonText = "Register for Event";
		buttonClass = 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-md hover:shadow-indigo-500/50';
	}


	return (
		<div className="bg-gray-800 p-6 rounded-xl shadow-lg hover:shadow-2xl transition duration-300 transform hover:-translate-y-1 border border-indigo-700/50">
			<h3 className="text-2xl font-bold text-indigo-400 mb-2">{event.summary || 'Ping Pong Event'}</h3>

			{/* Display the current registration count from event_attendance.count */}
			<div className="flex items-center text-sm font-semibold text-gray-300 mb-4 bg-gray-700/50 p-2 rounded-lg justify-center">
				<UserPlus className="w-4 h-4 text-indigo-400 mr-2" />
				<span className="text-indigo-300 mr-1">{currentCount}</span>
				{currentCount === 1 ? 'person' : 'people'} attending
			</div>

			<p className="text-gray-400 mb-4">{event.description || 'No description provided.'}</p>

			<div className="space-y-3 text-sm text-gray-300 mb-6">
				<div className="flex items-center">
					<Calendar className="w-5 h-5 text-indigo-500 mr-3" />
					<span>{date}</span>
				</div>
				<div className="flex items-center">
					<Clock className="w-5 h-5 text-indigo-500 mr-3" />
					<span>{timeRange} (Pacific Time)</span>
				</div>
				{event.location && (
					<div className="flex items-start">
						<MapPin className="w-5 h-5 text-indigo-500 mr-3 flex-shrink-0 mt-0.5" />
						<span className='break-words'>{event.location}</span>
					</div>
				)}
			</div>

			<button
				onClick={() => onRegisterClick(event)}
				disabled={isSubmitted}
				className={`w-full py-3 rounded-lg font-semibold transition duration-200 ${buttonClass}`}
			>
				{isConfirmed ? (
					<>
						<CheckCircle className="w-5 h-5 mr-2" />
						{buttonText}
					</>
				) : isPending ? (
					<>
						<Loader2 className="w-5 h-5 mr-2 animate-spin" />
						{buttonText}
					</>
				) : (
					buttonText
				)}
			</button>
		</div>
	);
};

// --- Pages ---

const HomePage = () => {
	const embedUrl = `https://calendar.google.com/calendar/embed?src=${CALENDAR_ID}&ctz=America%2FLos_Angeles&bgcolor=%23000000&color=%235c6bc0&showTabs=0&showPrint=0`;

	return (
		<div className="p-4 md:p-8 max-w-5xl mx-auto">
			<div className="bg-gray-800 p-4 sm:p-6 rounded-2xl shadow-2xl border border-indigo-700/50">
				<h2 className="text-3xl font-extrabold text-indigo-400 mb-4 flex items-center">
					<Calendar className="w-8 h-8 mr-3" /> Club Schedule
				</h2>
				<p className="text-gray-300 mb-6">View all practice times, tournaments, and special events below.</p>
				<div className="w-full aspect-video min-h-[400px] rounded-lg overflow-hidden border-2 border-indigo-600 shadow-inner shadow-black/50">
					{/* The Google Calendar iframe is responsive */}
					<iframe
						title="Folsom Youth Ping Pong Club Calendar"
						src={embedUrl}
						style={{ border: 0 }}
						width="100%"
						height="100%"
						frameBorder="0"
						scrolling="no"
					></iframe>
				</div>
			</div>
		</div>
	);
};

const RegistrationPage = () => {
	const { db, sessionUserId } = useFirebase();
	const [events, setEvents] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState(null);
	const [modalEvent, setModalEvent] = useState(null);
	// Set of event IDs confirmed by the Cloud Function
	const [confirmedEvents, setConfirmedEvents] = useState(new Set());
	// Object of {eventId: registrationDocId} for documents waiting for Cloud Function update
	const [pendingSubmissions, setPendingSubmissions] = useState({});
	// State to store registration counts: {eventId: count}
	const [eventCounts, setEventCounts] = useState({});


	const fetchEvents = useCallback(async () => {
		setIsLoading(true);
		setError(null);

		const timeMin = new Date().toISOString();
		const url = `https://www.googleapis.com/calendar/v3/calendars/${CALENDAR_ID}/events?timeMin=${timeMin}&singleEvents=true&orderBy=startTime&key=${API_KEY}`;

		const maxRetries = 3;
		let lastError = null;

		for (let attempt = 0; attempt < maxRetries; attempt++) {
			try {
				const response = await fetch(url);
				if (!response.ok) {
					throw new Error(`HTTP error! status: ${response.status}`);
				}
				const data = await response.json();

				const futureEvents = data.items
					.filter(event => event.start && event.start.dateTime)
					.sort((a, b) => new Date(a.start.dateTime) - new Date(b.start.dateTime));

				setEvents(futureEvents);
				setIsLoading(false);
				return;

			} catch (e) {
				lastError = e;
				console.error(`Attempt ${attempt + 1} failed:`, e);
				if (attempt < maxRetries - 1) {
					const delay = Math.pow(2, attempt) * 1000;
					await new Promise(resolve => setTimeout(resolve, delay));
				}
			}
		}

		setError(
			'Failed to fetch events from Google Calendar API. Check the API key, network, or calendar ID. (Error: ' + lastError.message + ')'
		);
		setIsLoading(false);
		setEvents([]);

	}, []);

	useEffect(() => {
		fetchEvents();
	}, [fetchEvents]);

	// 🚩 Listener to fetch ALL event counts in real-time
	useEffect(() => {
		if (!db) return;

		const collectionRef = collection(db, 'event_attendance');

		// This listener fires whenever *any* attendance document changes
		const unsubscribe = onSnapshot(collectionRef, (snapshot) => {
			const newCounts = {};
			snapshot.forEach(docSnap => {
				// The document ID is the event ID
				const eventId = docSnap.id;
				// Reading the 'count' field
				const count = docSnap.data().count || 0;
				newCounts[eventId] = count;
			});
			setEventCounts(newCounts);
		}, (error) => {
			console.error("Error listening to attendance counts:", error);
		});

		// Cleanup function for the listener
		return () => unsubscribe();
	}, [db]); // Run when the database object is ready


	// 🚩 Listener for real-time submission status updates
	useEffect(() => {
		if (!db) return;

		const unsubscribes = [];

		Object.entries(pendingSubmissions).forEach(([eventId, docId]) => {
			const docRef = doc(db, 'pingpong_registrations', docId);

			const unsubscribe = onSnapshot(docRef, (docSnap) => {
				if (docSnap.exists()) {
					const status = docSnap.data().attendanceStatus;

					if (status === 'SUCCESS') {
						// Move event from pending to confirmed
						setConfirmedEvents(prev => new Set(prev).add(eventId));
						setPendingSubmissions(prev => {
							const newPending = { ...prev };
							delete newPending[eventId];
							return newPending;
						});
					} else if (status === 'FAILED') {
						// Registration failed on the server, remove pending status
						setPendingSubmissions(prev => {
							const newPending = { ...prev };
							delete newPending[eventId];
							return newPending;
						});
						console.error(`Server failed to process registration for event ${eventId}.`);
					}
				}
			});
			unsubscribes.push(unsubscribe);
		});

		// Cleanup listeners
		return () => unsubscribes.forEach(unsub => unsub());

	}, [db, pendingSubmissions]);


	// Function passed to the EventCard when a successful submission occurs
	const handleSuccessfulSubmission = (eventId, registrationDocId) => {
		// Add the submission to the pending list immediately after the client write
		setPendingSubmissions(prev => ({
			...prev,
			[eventId]: registrationDocId
		}));
	};

	let content;

	if (isLoading) {
		content = (
			<div className="flex flex-col items-center justify-center p-12 bg-gray-800 rounded-xl">
				<Loader2 className="w-10 h-10 text-indigo-400 animate-spin" />
				<p className="mt-4 text-gray-300 text-lg">Loading current and future events...</p>
			</div>
		);
	} else if (error) {
		content = (
			<div className="bg-red-900/50 border border-red-700 p-6 rounded-xl text-red-300 flex items-start">
				<AlertCircle className="w-6 h-6 mr-3 flex-shrink-0" />
				<div>
					<h3 className='font-bold text-lg mb-1'>API Fetch Error</h3>
					<p>{error}</p>
					<p className='text-sm mt-2'>*Note: The API key provided may require proper activation and permissions on the Google Cloud side to work fully.</p>
				</div>
			</div>
		);
	} else if (events.length === 0) {
		content = (
			<div className="bg-gray-800 p-8 rounded-xl text-center border border-indigo-700/50">
				<Calendar className="w-12 h-12 text-indigo-400 mx-auto mb-4" />
				<p className="text-xl text-gray-300 font-medium">No future events are currently scheduled for registration.</p>
				<p className='text-gray-400 mt-2'>Check the main calendar for general practice times.</p>
			</div>
		);
	} else {
		content = (
			<>
				<div className='text-gray-500 text-xs mb-4 text-right'>
					Your session ID: {sessionUserId || 'Initializing...'}
				</div>

				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
					{events.map(event => (
						<EventCard
							key={event.id}
							event={event}
							onRegisterClick={setModalEvent} // Opens the modal
							confirmedEvents={confirmedEvents} // Pass confirmed set
							pendingSubmissions={pendingSubmissions} // Pass pending object
							currentCount={eventCounts[event.id] || 0} // Pass count
						/>
					))}
				</div>
				{/* Modal Renders conditionally */}
				{modalEvent && (
					<RegistrationModal
						event={modalEvent}
						onClose={() => setModalEvent(null)}
						onRegistered={handleSuccessfulSubmission} // Use the new handler
					/>
				)}
			</>
		);
	}

	return (
		<div className="p-4 md:p-8 max-w-7xl mx-auto">
			<h2 className="text-4xl font-extrabold text-white mb-6 flex items-center">
				<UserPlus className="w-9 h-9 mr-3 text-indigo-400" /> Event Registration
			</h2>
			<p className="text-lg text-gray-300 mb-10">Sign up for upcoming tournaments, workshops, and special club meetings.</p>
			{content}
		</div>
	);
};

// --- Main App Component ---

const App = () => {
	const [currentPage, setCurrentPage] = useState('home'); // 'home' or 'registration'

	// Navigation item component
	const NavItem = ({ page, label, Icon }) => (
		<button
			onClick={() => setCurrentPage(page)}
			className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition duration-200 focus:outline-none ${currentPage === page
				? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/50'
				: 'text-gray-300 hover:bg-gray-700 hover:text-white'
				}`}
		>
			<Icon className="w-5 h-5" />
			<span>{label}</span>
		</button>
	);

	return (
		// Global dark theme setup
		<FirebaseProvider>
			<div className="min-h-screen bg-gray-900 font-sans text-white">

				{/* Header / Navigation */}
				<header className="bg-gray-800 shadow-xl border-b border-indigo-700/50 sticky top-0 z-10">
					<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row justify-between items-center">
						<h1 className="text-3xl font-extrabold text-indigo-400 flex items-center mb-3 sm:mb-0">
							<Activity className="w-8 h-8 mr-2" />
							FYPPC
							<span className="text-xl text-gray-500 ml-2 font-normal hidden sm:inline">| Folsom Youth Ping Pong Club</span>
						</h1>
						<nav className="flex space-x-4">
							<NavItem page="home" label="Schedule" Icon={Calendar} />
							<NavItem page="registration" label="Register" Icon={UserPlus} />
							<NavItem page="admin" label="Admin" Icon={AlertCircle} />
						</nav>
					</div>
				</header>

				{/* Main Content */}
				<main>
					{currentPage === 'home' && <HomePage />}
					{currentPage === 'registration' && <RegistrationPage />}
					{currentPage === 'admin' && <AdminPage />}
				</main>

				{/* Footer */}
				<footer className="bg-gray-800 text-center py-6 mt-12 border-t border-indigo-700/50">
					<p className="text-gray-400 text-sm">© {new Date().getFullYear()} Folsom Youth Ping Pong Club. All rights reserved.</p>
				</footer>
			</div>
		</FirebaseProvider>
	);
};

export default App;
