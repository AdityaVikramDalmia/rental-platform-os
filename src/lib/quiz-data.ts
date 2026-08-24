export const ROOMMATE_PERSONALITIES = {
  NIGHT_OWL: {
    name: "The Night Owl",
    description:
      "You feel most alive after dark, enjoy late-night plans, and prefer a flexible home routine.",
    emoji: "🌙",
    compatibilityTips: [
      "Pick roommates comfortable with late lights and late dinners.",
      "Agree on quiet-hour boundaries for early sleepers.",
      "Use shared calendars for overnight guests and social plans.",
    ],
  },
  SOCIAL_BUTTERFLY: {
    name: "The Social Butterfly",
    description:
      "You thrive around people, energy, and spontaneous plans, and your home often becomes a social hub.",
    emoji: "🦋",
    compatibilityTips: [
      "Set guest and gathering rules early.",
      "Create common-space schedules for work-from-home days.",
      "Balance social evenings with occasional quiet nights.",
    ],
  },
  NEAT_FREAK: {
    name: "The Neat Freak",
    description:
      "You value structure, cleanliness, and visual order, and you feel calm when everything has its place.",
    emoji: "✨",
    compatibilityTips: [
      "Use a simple weekly cleaning rota.",
      "Define kitchen and bathroom reset rules.",
      "Keep shared storage labels for easy organization.",
    ],
  },
  CHILL_ROOMMATE: {
    name: "The Chill Roommate",
    description:
      "You are adaptable and low-drama, and you prefer a relaxed environment over strict routines.",
    emoji: "😌",
    compatibilityTips: [
      "Agree on must-have boundaries without overcomplicating.",
      "Keep communication casual but regular.",
      "Use lightweight reminders for shared expenses.",
    ],
  },
} as const;

export type RoommatePersonalityId = keyof typeof ROOMMATE_PERSONALITIES;

export type QuizOption = {
  id: string;
  label: string;
  personality: RoommatePersonalityId;
};

export type QuizQuestion = {
  id: string;
  question: string;
  options: QuizOption[];
};

export const QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    id: "wake-up-time",
    question: "What time do you usually wake up?",
    options: [
      { id: "before-7", label: "Before 7 AM", personality: "NEAT_FREAK" },
      { id: "7-9", label: "7-9 AM", personality: "CHILL_ROOMMATE" },
      { id: "9-11", label: "9-11 AM", personality: "SOCIAL_BUTTERFLY" },
      { id: "after-11", label: "After 11 AM", personality: "NIGHT_OWL" },
    ],
  },
  {
    id: "guests-at-home",
    question: "How do you feel about guests at home?",
    options: [
      { id: "love-it", label: "Love it", personality: "SOCIAL_BUTTERFLY" },
      { id: "occasionally", label: "Occasionally fine", personality: "CHILL_ROOMMATE" },
      {
        id: "advance-notice",
        label: "Prefer advance notice",
        personality: "NEAT_FREAK",
      },
      { id: "no-guests", label: "Prefer no guests", personality: "NIGHT_OWL" },
    ],
  },
  {
    id: "ideal-weekend",
    question: "Your ideal weekend at home?",
    options: [
      { id: "cooking", label: "Cooking brunch", personality: "NEAT_FREAK" },
      { id: "netflix", label: "Netflix marathon", personality: "NIGHT_OWL" },
      { id: "workout", label: "Working out", personality: "CHILL_ROOMMATE" },
      { id: "friends", label: "Out with friends", personality: "SOCIAL_BUTTERFLY" },
    ],
  },
  {
    id: "kitchen-cleanliness",
    question: "Kitchen cleanliness level?",
    options: [
      { id: "spotless", label: "Spotless always", personality: "NEAT_FREAK" },
      { id: "after-cooking", label: "Clean after cooking", personality: "CHILL_ROOMMATE" },
      { id: "end-of-day", label: "End of day cleanup", personality: "NIGHT_OWL" },
      { id: "relaxed", label: "Relaxed approach", personality: "SOCIAL_BUTTERFLY" },
    ],
  },
  {
    id: "work-from-home",
    question: "How often do you work from home?",
    options: [
      { id: "everyday", label: "Every day", personality: "NEAT_FREAK" },
      { id: "few-days", label: "Few days a week", personality: "CHILL_ROOMMATE" },
      { id: "rarely", label: "Rarely", personality: "SOCIAL_BUTTERFLY" },
      { id: "never", label: "Never", personality: "NIGHT_OWL" },
    ],
  },
];

export function calculateQuizResult(answers: RoommatePersonalityId[]): RoommatePersonalityId {
  if (answers.length === 0) {
    return "CHILL_ROOMMATE";
  }

  const scores = answers.reduce<Record<RoommatePersonalityId, number>>(
    (acc, personality) => {
      acc[personality] += 1;
      return acc;
    },
    {
      NIGHT_OWL: 0,
      SOCIAL_BUTTERFLY: 0,
      NEAT_FREAK: 0,
      CHILL_ROOMMATE: 0,
    },
  );

  const highestScore = Math.max(...Object.values(scores));

  return (
    Object.entries(scores)
      .filter(([, score]) => score === highestScore)
      .map(([personality]) => personality as RoommatePersonalityId)
      .sort((a, b) =>
        ROOMMATE_PERSONALITIES[a].name.localeCompare(ROOMMATE_PERSONALITIES[b].name),
      )[0] ?? "CHILL_ROOMMATE"
  );
}
