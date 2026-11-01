'use strict';
/**
 * AI Study Guide — DeepSeek (OpenAI-compatible) via axios, following the Worker pattern.
 * This file is the only place that knows about the provider.
 */
const axios = require('axios');
const { Op, fn, col } = require('sequelize');
const config = require('../config');
const { AiInteraction } = require('../models');
const { ApiError, logger } = require('../utils');

const client = axios.create({ baseURL: config.ai.baseUrl, timeout: config.ai.timeoutMs, headers: { 'Content-Type': 'application/json' } });

const SYSTEM = `You are the GenWise Africa AI Study Guide, a warm, wise and Christ-centred learning companion on a Christian mentorship platform for Africa.
Guidelines:
- Support, never replace, the human instructor and mentor. When questions need pastoral care, counselling or doctrinal rulings, gently encourage the learner to speak with their instructor, mentor or pastor.
- Be respectful across Christian traditions; avoid denominational disputes. Quote Scripture accurately with references (book chapter:verse) and prefer well-known translations.
- Be concise, practical and encouraging. Use short paragraphs and bullet points. Use simple English suitable for young adults.
- If someone expresses thoughts of self-harm, abuse or crisis, respond with compassion, encourage them to contact a trusted person, pastor or local emergency services immediately, and do not continue the lesson.
- Never invent facts about the course; ground answers in the lesson content provided.`;

const MODES = {
  summarize: 'Summarise this lesson in 5 clear bullet points, then give one key Scripture and one sentence of application.',
  explain: 'Explain the main ideas of this lesson simply, as a wise mentor would to a young adult, with a relatable African everyday example.',
  quiz: 'Create 3 multiple-choice questions (A-D) to test understanding of this lesson. Put the answers with one-line explanations at the end under "Answers".',
  apply: 'Help me apply this lesson to my life: give 3 practical actions for this week, one reflection question for journaling, and a short prayer.',
  scripture: 'List 4 Bible passages that relate to this lesson, each with the reference, a one-line summary and how it connects.',
  ask: null,
};

async function chat({ system = SYSTEM, user, temperature = config.ai.temperature, maxTokens = config.ai.maxTokens, json = false }) {
  if (!config.ai.apiKey) throw new ApiError(503, 'The AI Study Guide is not configured yet', 'AI_DISABLED');
  const body = { model: config.ai.model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], temperature, max_tokens: maxTokens, stream: false };
  if (json) body.response_format = { type: 'json_object' };
  try {
    const { data } = await client.post('/chat/completions', body, { headers: { Authorization: `Bearer ${config.ai.apiKey}` } });
    return { content: data?.choices?.[0]?.message?.content || '', usage: data?.usage || {} };
  } catch (e) {
    const status = e.response ? e.response.status : 'network';
    logger.error('DeepSeek call failed', { status, message: e.message });
    throw new ApiError(502, `The AI Study Guide is unavailable right now (${status})`, 'AI_ERROR');
  }
}

async function usedToday(tenantId) {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const row = await AiInteraction.findOne({
    attributes: [[fn('COALESCE', fn('SUM', col('prompt_tokens')), 0), 'p'], [fn('COALESCE', fn('SUM', col('completion_tokens')), 0), 'c']],
    where: { tenantId, createdAt: { [Op.gte]: start } }, raw: true,
  });
  return Number(row?.p || 0) + Number(row?.c || 0);
}

async function lessonGuide({ tenant, user, lesson, course, mode, question }) {
  if (!(mode in MODES)) throw ApiError.badRequest('Unknown mode');
  if (mode === 'ask' && !String(question || '').trim()) throw ApiError.badRequest('Please type a question');
  if (await usedToday(tenant.id) > config.ai.dailyBudgetPerTenant) throw ApiError.tooMany('This academy has reached today\'s AI limit. Please try again tomorrow.');

  const context = `Course: ${course.title}\nLesson: ${lesson.title}\nScripture references: ${lesson.scriptureRefs || 'n/a'}\n\nLesson content:\n${String(lesson.content || '').slice(0, 8000)}`;
  const instruction = mode === 'ask' ? `Learner question: ${String(question).slice(0, 1000)}` : MODES[mode];
  const out = await chat({ user: `${context}\n\n---\n${instruction}` });
  await AiInteraction.create({ tenantId: tenant.id, userId: user.id, lessonId: lesson.id, mode, promptTokens: out.usage.prompt_tokens || 0, completionTokens: out.usage.completion_tokens || 0 });
  return { answer: out.content, mode };
}

async function draftQuiz({ tenant, user, topic, count = 5 }) {
  if (await usedToday(tenant.id) > config.ai.dailyBudgetPerTenant) throw ApiError.tooMany('Daily AI limit reached');
  const out = await chat({
    json: true, temperature: 0.3,
    user: `Create ${Math.min(count, 10)} multiple-choice questions for a Christian discipleship course on this material. Return JSON: {"questions":[{"prompt":"...","options":["a","b","c","d"],"answer":<index 0-3>,"explanation":"..."}]}\n\nMaterial:\n${String(topic).slice(0, 8000)}`,
  });
  await AiInteraction.create({ tenantId: tenant.id, userId: user.id, mode: 'quiz_draft', promptTokens: out.usage.prompt_tokens || 0, completionTokens: out.usage.completion_tokens || 0 });
  try { return JSON.parse(out.content).questions || []; } catch { throw new ApiError(502, 'AI returned an unexpected format, please retry', 'AI_FORMAT'); }
}

module.exports = { chat, lessonGuide, draftQuiz, MODES, enabled: () => !!config.ai.apiKey };
