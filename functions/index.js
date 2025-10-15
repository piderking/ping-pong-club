// index.js (Revised Cloud Function)

const admin = require("firebase-admin");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { google } = require("googleapis");
require("dotenv").config();

// Initialize Firebase Admin SDK
admin.initializeApp();
const db = admin.firestore();

// 3. Define the Firestore Trigger Function (CORRECT V2 SYNTAX)
exports.addAttendeesToCalendar = onDocumentCreated(
  "event_attendance/{calendarEventId}",
  async (event) => {
    const base64Key = process.env.CALENDAR_KEY;

    // Safety check: ensure the secret was injected
    if (!base64Key) {
      throw new Error(
        "CALENDAR_KEY environment variable not set. Check Secret Manager setup.",
      );
    }

    // Decode and create credentials
    const keyContent = Buffer.from(base64Key, "base64").toString("utf8");
    const credentials = JSON.parse(keyContent);

    console.log(credentials);
    // 2. Create the JWT client for authentication
    const auth = new google.auth.JWT(
      credentials.client_email,
      null,
      credentials.private_key,
      ["https://www.googleapis.com/auth/calendar"], // Scope for calendar editing
    );
    // V2: Check for event data first
    if (!event.data) {
      console.log("No data associated with the event.");
      return null;
    }

    const snap = event.data; // event.data is the DocumentSnapshot
    const eventAttendance = snap.data();
    const calendarEventId = event.params.calendarEventId; // V2: params are on the event object

    // IMPORTANT: Use the exact email of the calendar you shared the Service Account with
    // Assuming CALENDAR_ID is securely passed via process.env
    const calendarId = process.env.CALENDAR_ID + "@group.calendar.google.com";

    if (
      !eventAttendance.emails ||
      !Array.isArray(eventAttendance.emails) ||
      eventAttendance.emails.length === 0
    ) {
      console.log("No emails provided to invite.");
      return null;
    }

    // Assume 'auth' is defined globally or passed into the function scope
    // Note: If 'auth' is dependent on the secret, it should be defined inside or before this function.
    await auth.authorize();
    const calendar = google.calendar({ version: "v3", auth: auth });

    try {
      // Prepare new attendees list
      const newAttendees = eventAttendance.emails.map((email) => ({
        email: email,
        responseStatus: "needsAction",
      }));

      // 4. Get the existing event to merge attendees
      const getResponse = await calendar.events.get({
        calendarId,
        eventId: calendarEventId,
      });
      const existingEvent = getResponse.data;
      const currentAttendees = existingEvent.attendees || [];

      // Merge lists and filter duplicates
      const uniqueNewEmails = new Set(
        newAttendees.map((a) => a.email.toLowerCase()),
      );
      const allAttendees = currentAttendees
        .filter((a) => !uniqueNewEmails.has(a.email.toLowerCase()))
        .concat(newAttendees);

      // 5. Update the event and send notifications
      const updateResponse = await calendar.events.update({
        calendarId: calendarId,
        eventId: calendarEventId,
        requestBody: {
          ...existingEvent,
          attendees: allAttendees,
        },
        sendNotifications: true,
      });

      console.log(
        "Successfully updated event and sent invitations:",
        updateResponse.data.htmlLink,
      );
      // Update the document to show success status
      return snap.ref.update({ calendarUpdateStatus: "COMPLETED" });
    } catch (error) {
      console.error("Error adding attendees to Google Calendar:", error);
      // Update the document to show error status
      return snap.ref.update({
        calendarUpdateStatus: "ERROR",
        errorMessage: error.message,
      });
    }
  },
);

exports.rsvpGuest = onDocumentCreated(
  "pingpong_registrations/{registrationId}",
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) {
      return null;
    }

    const registration = snapshot.data();
    const registrationRef = snapshot.ref;

    // Access properties using dot-notation for reliability
    const name = registration.name;
    const email = registration.email;
    const selectedEventId = registration.selectedEventId;

    // Variable to track the final count (for logging only)
    let finalNewCount = 0;
    let isDuplicate = false; // Flag for duplicate submissions

    // --- VALIDATION ---
    if (!selectedEventId || !email || !name) {
      console.warn("Missing required fields. Skipping attendance update.");
      return registrationRef.update({
        attendanceStatus: "SKIPPED_MISSING_DATA",
        processedAt: new Date(),
      });
    }

    const attendanceRef = db
      .collection("event_attendance")
      .doc(selectedEventId);

    try {
      // Use a transaction to safely read and update the attendance count
      await db.runTransaction(async (transaction) => {
        const attendanceDoc = await transaction.get(attendanceRef);

        let newAttendees;

        if (!attendanceDoc.exists) {
          // Case 1: First registration for this event
          newAttendees = [email];
          finalNewCount = 1;
        } else {
          // Case 2: Event already has registrations
          const currentData = attendanceDoc.data();
          const currentAttendees = currentData.emails || [];

          // Check if email is already listed
          if (currentAttendees.includes(email)) {
            console.log(`${email} is already counted for this event.`);
            isDuplicate = true; // Set flag
            finalNewCount = currentData.count; // Get existing count for logging
            return; // Exit transaction without updating attendance document
          }

          // Add new attendee
          newAttendees = [...currentAttendees, email];
          finalNewCount = newAttendees.length;
        }

        // Only write to the attendance summary document if it's NOT a duplicate
        if (!isDuplicate) {
          transaction.set(
            attendanceRef,
            {
              emails: newAttendees,
              count: finalNewCount,
              lastUpdated: new Date(),
            },
            { merge: true },
          );
        }
      });

      // After the transaction completes:

      if (!isDuplicate) {
        console.log(
          `Successfully updated attendance for event ${selectedEventId}. New count: ${finalNewCount}`,
        );
      }

      // 🚩 CRITICAL: Update the registration document with the final status.
      // The front-end is listening for this exact status!
      return registrationRef.update({
        attendanceStatus: "SUCCESS", // <--- THIS IS REQUIRED BY THE FRONT-END LISTENER
        processedAt: new Date(),
      });
    } catch (error) {
      console.error("Firestore Transaction Error:", error.message);

      // Update the Firestore record to mark as failed processing
      return registrationRef.update({
        attendanceStatus: "FAILED", // <--- The front-end also needs to handle this
        errorMessage: error.message,
        processedAt: new Date(),
      });
    }
  },
);
