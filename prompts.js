/**
 * Legacy prompt library.
 *
 * Grounded in palliative-care and bereavement research (see
 * docs/PROMPT_RESEARCH.md): Dignity Therapy's question protocol, Byock's
 * "Four Things", ethical-will practice, and studies of what bereaved children
 * wish they'd had: specific, personal communication, the parent's values, and
 * how the parent felt about *them*.
 *
 * Design rules from that research:
 *  - Every prompt is optional; skipping is always one tap.
 *  - Light categories come first. "Gratitude & repair" is gentle-gated.
 *  - Never ask directly for trauma ("your worst moment").
 *  - Messages to someone nudge toward "I hope", not "you must".
 *
 * `{name}` is replaced with the person a message is for.
 */
(() => {
  'use strict';

  const CATEGORIES = [
    {
      id: 'someone',
      title: 'Someone specific',
      blurb: 'Something you want a particular person to hear',
      needsRecipient: true,
      prompts: [
        'What do you want {name} to know about how you feel about them?',
        'What do you love most about who {name} is becoming?',
        'What do you remember about the day {name} was born, or came into your life?',
        'What would you tell {name} on a day when everything feels too hard?',
        'If {name} gets married, what would you want to say to them that day?',
        'What would you like {name} to know when they become a parent?',
        'Is there a story about {name} they might be too young to remember?',
        'What are you proud of {name} for, apart from any achievement?',
        'What do you hope {name} always remembers about the two of you?',
        'What do you see in {name} that they might not see in themselves?',
      ],
    },
    {
      id: 'everyday',
      title: 'Everyday me',
      blurb: 'The small things people miss most',
      prompts: [
        'Talk us through a recipe you make by heart.',
        'What sayings or phrases do you always use?',
        'What does a perfect ordinary Sunday look like for you?',
        'What songs, smells, or places instantly take you back?',
        'How do you take your coffee or tea, and why that way?',
        'What makes you laugh every single time?',
        'Tell your favourite joke, or sing a few lines of a song you love.',
        'What little habits of yours do you think people would notice?',
      ],
    },
    {
      id: 'story',
      title: 'A story about me',
      blurb: 'A chapter of your life, big or small',
      prompts: [
        'When did you feel most alive?',
        'What was your childhood home like? Walk me through it.',
        'What were you like at seventeen?',
        'How did you meet the people who mattered most to you?',
        'What work or role are you proudest of, and why?',
        'What chapter of your life surprised you most?',
        'What was your first job, and what did you spend the money on?',
        'Tell about a trip that didn’t go as planned.',
        'Describe a place you could still walk through with your eyes closed.',
      ],
    },
    {
      id: 'roots',
      title: 'Family & roots',
      blurb: 'Where we come from',
      prompts: [
        'What do you know about your grandparents’ lives?',
        'Where does our family come from, and how did we end up here?',
        'Which family stories got told again and again?',
        'What traditions came down to you, and where did they start?',
        'Who in the family do you think people should remember?',
        'What was a normal family dinner like when you were growing up?',
      ],
    },
    {
      id: 'believe',
      title: 'What I believe',
      blurb: 'Values, opinions, and where you stand',
      prompts: [
        'What do you believe about how people should treat each other?',
        'What gives your life meaning?',
        'What’s something you changed your mind about as you got older?',
        'What do you hope never changes in our family?',
        'What do you think happens, or hope happens, after we die?',
        'What’s an opinion you hold that might surprise people?',
      ],
    },
    {
      id: 'advice',
      title: 'Advice & lessons',
      blurb: 'What life taught you',
      prompts: [
        'What did you learn the hard way that you’d like to spare others?',
        'What advice would you give about love and partnership?',
        'How do you get through a really bad week?',
        'What do you wish you’d known sooner about money, work, or time?',
        'What mistake taught you the most?',
        'What should people worry about less?',
      ],
    },
    {
      id: 'repair',
      title: 'Gratitude & repair',
      blurb: 'Thank-yous, apologies, and things left unsaid',
      gentle: 'These can stir up a lot. Go at your own pace. You can save anything as "Just me" and decide later whether to share it.',
      prompts: [
        'Who would you like to thank, and for what?',
        'Is there something left unsaid that you’d like to say now?',
        'Is there anything you’d like to say sorry for?',
        'Is there someone you’d like to tell that you forgive them, or that you’re letting go?',
        'What do you want the people you love to know you’re grateful for?',
      ],
    },
  ];

  // Gentle follow-ups (from reminiscence and Dignity Therapy practice).
  // Category-specific ones come first.
  const FOLLOW_UPS = {
    generic: [
      'What happened next?',
      'Who else was there?',
      'What did it look, sound, or smell like?',
      'How did you feel then, and how do you feel about it now?',
      'Why do you think this one stuck with you?',
      'Is there a part you’d like to say more about?',
    ],
    someone: [
      'What would you want {name} to take from this?',
      'Is there a memory of the two of you that goes with this?',
      'What do you hope {name} feels when they hear this?',
    ],
    photo: [
      'Who took these photos, and who’s missing from them?',
      'Is there someone or something in the background worth pointing out?',
      'What happened just before or just after these were taken?',
    ],
    everyday: [
      'Who taught you this, or where did it come from?',
      'When do you remember doing it most?',
    ],
    story: [
      'Who were you then, compared to now?',
      'What did you learn from it?',
    ],
    roots: [
      'Who told you this story?',
      'Is there anything you wish you’d asked them?',
    ],
    believe: [
      'When did you first start to believe this?',
      'What would you say to someone who sees it differently?',
    ],
    advice: [
      'Is there a moment that taught you this?',
      'How would you put it to someone young?',
    ],
    repair: [
      'Is there anything you’d want them to do with this, or nothing at all?',
      'How does it feel to have said it?',
    ],
  };

  const OCCASIONS = [
    'Anytime',
    'On a hard day',
    'On their birthday',
    'On their wedding day',
    'When they become a parent',
    'When they graduate',
    'When they miss me',
    'After I’m gone',
  ];

  function fill(text, name) {
    return String(text).replace(/\{name\}/g, name && name.trim() ? name.trim() : 'them');
  }
  function category(id) { return CATEGORIES.find(c => c.id === id) || null; }

  /** Follow-ups for a memory: category-specific first, then generic. */
  function followUpsFor({ categoryId, recipient, hasGallery }) {
    const list = [];
    if (recipient) list.push(...FOLLOW_UPS.someone);
    if (hasGallery) list.push(...FOLLOW_UPS.photo);
    if (categoryId && FOLLOW_UPS[categoryId] && categoryId !== 'someone') list.push(...FOLLOW_UPS[categoryId]);
    list.push(...FOLLOW_UPS.generic);
    return [...new Set(list)].map(q => fill(q, recipient));
  }

  window.LegacyPrompts = { CATEGORIES, FOLLOW_UPS, OCCASIONS, fill, category, followUpsFor };
})();
