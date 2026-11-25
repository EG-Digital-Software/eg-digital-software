import type { AdminRoute } from '../types';
import FeedbackHome from './FeedbackHome';
import ReviewLinksScreen from './ReviewLinksScreen';
import TestimonialDetailScreen from './TestimonialDetailScreen';
import TestimonialEditScreen from './TestimonialEditScreen';
import WidgetScreen from './WidgetScreen';

/**
 * Feedback routes (root stack):
 *   Feedback                 —        reviews + testimonials (entry, linked from More)
 *   FeedbackTestimonial      { id }   one testimonial (media, answers, actions)
 *   FeedbackTestimonialEdit  { id }   service tag + wording edit
 *   FeedbackLinks            —        review-site links
 *   FeedbackWidget           —        website widget embed code
 */
export const routes: AdminRoute[] = [
  { name: 'Feedback', component: FeedbackHome },
  { name: 'FeedbackTestimonial', component: TestimonialDetailScreen },
  { name: 'FeedbackTestimonialEdit', component: TestimonialEditScreen },
  { name: 'FeedbackLinks', component: ReviewLinksScreen },
  { name: 'FeedbackWidget', component: WidgetScreen },
];
