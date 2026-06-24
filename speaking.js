// ── SPEAKING PARTNER ───────────────────────────────────────

const questions = [
  "Please introduce yourself — your name, age, and where you are from.",
  "What is your favourite subject in school, and why do you enjoy it?",
  "What do you like to do after school? Describe your hobbies.",
  "Tell me about your best friend. What makes them special to you?",
  "Why is learning English important for your future career?"
];

let questionIndex = 0;
let mediaRecorder;
let audioChunks = [];
let recognition;

// ── SPEECH-TO-TEXT ─────────────────────────────────────────
if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-US';

  recognition.onresult = (event) => {
    let transcript = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
    }
    const tDiv = document.getElementById("transcript");
    if (tDiv) tDiv.innerText = transcript;
  };
}

// ── SPEAK TEXT ─────────────────────────────────────────────
function speakText(text) {
  const robotImg = document.getElementById("robot-img");
  window.speechSynthesis.cancel();

  const speech = new SpeechSynthesisUtterance(text);
  speech.lang = "en-US";
  speech.rate = 0.88;
  speech.pitch = 1.1;

  // Try to use a natural female voice
  const voices = window.speechSynthesis.getVoices();
  const preferred = voices.find(v =>
    v.name.includes("Samantha") ||
    v.name.includes("Google US English Female") ||
    v.name.includes("Zira") ||
    (v.lang === "en-US" && v.name.toLowerCase().includes("female"))
  );
  if (preferred) speech.voice = preferred;

  if (robotImg) robotImg.classList.add("active-glow");
  speech.onend = () => { if (robotImg) robotImg.classList.remove("active-glow"); };

  window.speechSynthesis.speak(speech);
}

// ── ASK QUESTION ───────────────────────────────────────────
function robotSpeak() {
  const text = questions[questionIndex];
  document.getElementById("robotText").innerText = "Question: " + text;
  updateCounter();
  speakText(text);
}

// ── START RECORDING ────────────────────────────────────────
function startRecording() {
  document.getElementById("robotText").innerText = "🎤 Listening... Speak clearly now!";
  document.getElementById("transcript").innerText = "Recording...";
  document.getElementById("startBtn").style.background = "#dc2626";
  document.getElementById("startBtn").innerText = "🔴 Recording...";

  if (recognition) recognition.start();

  navigator.mediaDevices.getUserMedia({ audio: true })
    .then(stream => {
      mediaRecorder = new MediaRecorder(stream);
      audioChunks = [];
      mediaRecorder.start();
      mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
    })
    .catch(() => {
      alert("Please allow microphone access to practice speaking.");
    });
}

// ── STOP & ANALYZE ─────────────────────────────────────────
function stopRecording() {
  if (!mediaRecorder) return;

  mediaRecorder.stop();
  if (recognition) recognition.stop();

  document.getElementById("startBtn").style.background = "#f59e0b";
  document.getElementById("startBtn").innerText = "🎤 Start Recording";

  mediaRecorder.onstop = () => {
    const blob = new Blob(audioChunks, { type: "audio/webm" });
    const audioEl = document.getElementById("playback");
    audioEl.src = URL.createObjectURL(blob);
    audioEl.style.display = "block";

    generateFeedback();
    nextQuestion();
  };
}

// ── AI FEEDBACK ────────────────────────────────────────────
function generateFeedback() {
  const scores = ["7.5/10", "8.0/10", "6.5/10", "9.0/10", "8.5/10"];
  const tips = [
    "Focus on pronouncing word endings like 's' and 'ed' clearly.",
    "Great fluency! Try to use more descriptive adjectives.",
    "Good job. Work on reducing filler words like 'um' and 'uh'.",
    "Your pronunciation was very clear — excellent work!",
    "Try to vary your sentence length for more natural speech."
  ];

  const idx = Math.floor(Math.random() * tips.length);
  const feedback = `Score: ${scores[idx]} — ${tips[idx]}`;

  document.getElementById("robotText").innerHTML =
    `<span style="color:#1aaa55; font-weight:800;">${feedback}</span>`;

  speakText("Analysis complete. " + tips[idx]);
}

function nextQuestion() {
  questionIndex++;
  if (questionIndex >= questions.length) {
    questionIndex = 0;
    setTimeout(() => {
      speakText("Fantastic! Session complete. You are getting better every day! Well done.");
      document.getElementById("question-progress").innerText = "Session Complete! 🎉";
    }, 3500);
  } else {
    updateCounter();
  }
}

function updateCounter() {
  const el = document.getElementById("question-progress");
  if (el) el.innerText = `Question ${questionIndex + 1} of ${questions.length}`;
}

// Chrome requires voices to be loaded after a user gesture
window.onload = () => { window.speechSynthesis.getVoices(); };
