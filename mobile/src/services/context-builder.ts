import { AppSettings, ModeId, Turn } from '../types';

export function buildInterviewContext(settings: AppSettings, mode: ModeId, turns: Turn[]): string | null {
  const blocks: string[] = [];

  if (settings.resumeText && settings.resumeText.trim()) {
    blocks.push('Candidate Résumé:\n' + settings.resumeText.slice(0, 3000));
  }

  if (settings.jobDescription && settings.jobDescription.trim()) {
    blocks.push('Target Job Description:\n' + settings.jobDescription.slice(0, 2000));
  }

  if (settings.starStories && settings.starStories.trim()) {
    blocks.push('Candidate STAR Stories & Achievements:\n' + settings.starStories);
  }

  if (settings.whyCompany && settings.whyCompany.trim()) {
    blocks.push('Motivation & Why This Company:\n' + settings.whyCompany);
  }

  if (settings.salaryTarget && settings.salaryTarget.trim()) {
    blocks.push('Compensation Target: ' + settings.salaryTarget);
  }

  if (settings.questionsToAsk && settings.questionsToAsk.trim()) {
    blocks.push('Candidate Questions to Ask:\n' + settings.questionsToAsk);
  }

  return blocks.length > 0 ? blocks.join('\n\n---\n\n') : null;
}
