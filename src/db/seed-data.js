/**
 * Demo content. All people below are fictitious test accounts; no real student data.
 * In each question, `correct` is the zero-based index of the right option.
 */

export const DEMO_PASSWORD = 'Password123!';

export const users = [
  { name: 'Ada Lovelace', email: 'ada@test.dev' },
  { name: 'Grace Hopper', email: 'grace@test.dev' },
  { name: 'Alan Turing', email: 'alan@test.dev' },
];

export const badges = [
  {
    code: 'FIRST_STEPS',
    name: 'First Steps',
    description: 'Completed your first quiz.',
    rule: { type: 'quizzes_completed_at_least', value: 1 },
  },
  {
    code: 'PERFECT_SCORE',
    name: 'Perfect Score',
    description: 'Scored 100% on a quiz.',
    rule: { type: 'perfect_score' },
  },
  {
    code: 'XP_100',
    name: 'XP 100',
    description: 'Reached 100 XP.',
    rule: { type: 'xp_at_least', value: 100 },
  },
];

export const quizzes = [
  {
    slug: 'digital-literacy-basics',
    title: 'Digital Literacy Basics',
    description: 'Twelve quick questions on the web, online safety and everyday tech.',
    xp_per_correct: 10,
    questions: [
      {
        text: 'What does HTML stand for?',
        options: ['Hyperlink Text Management Logic', 'HyperText Markup Language', 'High Transfer Machine Language', 'Home Tool Markup Language'],
        correct: 1,
      },
      {
        text: 'Which protocol encrypts traffic between your browser and a website?',
        options: ['HTTP', 'FTP', 'HTTPS', 'SMTP'],
        correct: 2,
      },
      {
        text: 'Which of these is the strongest password?',
        options: ['Tr4in-Blue-Kettle-92!', 'password123', '12345678', 'qwerty'],
        correct: 0,
      },
      {
        text: 'What does CSS mainly control on a web page?',
        options: ['Database storage', 'Server security', 'Network routing', 'Layout and visual style'],
        correct: 3,
      },
      {
        text: 'Phishing is best described as…',
        options: ['A way to speed up Wi-Fi', 'Tricking people into revealing sensitive information', 'A programming language', 'A type of antivirus scan'],
        correct: 1,
      },
      {
        text: 'Which programming language runs natively in web browsers?',
        options: ['JavaScript', 'Python', 'C++', 'Java'],
        correct: 0,
      },
      {
        text: 'What does URL stand for?',
        options: ['Universal Routing Link', 'Unified Resource Library', 'Uniform Resource Locator', 'User Request Line'],
        correct: 2,
      },
      {
        text: 'Which device forwards data packets between networks?',
        options: ['Monitor', 'Keyboard', 'Printer', 'Router'],
        correct: 3,
      },
      {
        text: 'Two-factor authentication (2FA) adds…',
        options: ['A second password saved in the browser', 'A second proof of identity on top of your password', 'A backup copy of your files', 'Faster logins'],
        correct: 1,
      },
      {
        text: 'Which of these is an example of cloud storage?',
        options: ['USB flash drive', 'External hard disk', 'Google Drive', 'CD-ROM'],
        correct: 2,
      },
      {
        text: 'One kilobyte is roughly how many bytes?',
        options: ['1,000', '100', '1,000,000', '10'],
        correct: 0,
      },
      {
        text: 'What is the main job of a web browser?',
        options: ['Writing code', 'Storing emails offline', 'Designing databases', 'Fetching and displaying web pages'],
        correct: 3,
      },
    ],
  },
  {
    slug: 'nigeria-quick-facts',
    title: 'Nigeria Quick Facts',
    description: 'Six questions on Nigerian civics and geography.',
    xp_per_correct: 10,
    questions: [
      {
        text: 'What is the capital of Nigeria?',
        options: ['Lagos', 'Abuja', 'Kano', 'Ibadan'],
        correct: 1,
      },
      {
        text: 'In which year did Nigeria gain independence?',
        options: ['1957', '1963', '1960', '1970'],
        correct: 2,
      },
      {
        text: 'What is the name of Nigeria’s currency?',
        options: ['Naira', 'Cedi', 'Rand', 'Shilling'],
        correct: 0,
      },
      {
        text: 'What are the colours of the Nigerian flag?',
        options: ['Red and white', 'Green, yellow and red', 'Blue and white', 'Green and white'],
        correct: 3,
      },
      {
        text: 'Which is the longest river flowing through Nigeria?',
        options: ['Benue', 'Niger', 'Ogun', 'Kaduna'],
        correct: 1,
      },
      {
        text: 'How many states does Nigeria have?',
        options: ['30', '19', '36', '40'],
        correct: 2,
      },
    ],
  },
];
