import { ForumComment, ForumAuthor } from "@/types/forum";

const commentAuthors: ForumAuthor[] = [
  {
    id: "commenter-1",
    displayName: "Patricia L.",
    avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100&h=100&fit=crop",
    isAnonymous: false,
    role: "family",
    joinedDate: "2024-02-10",
    postCount: 15,
  },
  {
    id: "commenter-2",
    displayName: "David H.",
    avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100&fit=crop",
    isAnonymous: false,
    role: "caregiver",
    joinedDate: "2023-09-15",
    postCount: 52,
  },
  {
    id: "commenter-3",
    displayName: "Anonymous",
    isAnonymous: true,
    role: "family",
    joinedDate: "2024-08-20",
    postCount: 2,
  },
  {
    id: "commenter-4",
    displayName: "Dr. James Wilson",
    avatar: "https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=100&h=100&fit=crop",
    isAnonymous: false,
    role: "expert",
    joinedDate: "2023-06-01",
    postCount: 89,
  },
];

export const mockForumComments: ForumComment[] = [
  {
    id: "comment-1",
    postId: "post-1",
    content: `We went through this exact situation last year. The turning point for us was when my father started wandering at night and we found him outside twice in his pajamas. Safety became our primary concern.\n\nThe doctor told us to consider memory care when:\n- They can't be left alone safely\n- They need help with most daily activities\n- Their behavior puts themselves or others at risk\n\nIt's such a hard decision but you're not alone.`,
    author: commentAuthors[0],
    createdAt: "2024-12-15T14:22:00Z",
    updatedAt: "2024-12-15T14:22:00Z",
    likeCount: 18,
    isAcceptedAnswer: true,
  },
  {
    id: "comment-2",
    postId: "post-1",
    content: `For us it was the medication management. Mom was either taking pills multiple times or not at all. Memory care facilities have staff who manage medications properly.\n\nDon't feel guilty - you're trying to get her the best care possible.`,
    author: commentAuthors[1],
    createdAt: "2024-12-15T15:45:00Z",
    updatedAt: "2024-12-15T15:45:00Z",
    likeCount: 12,
    isAcceptedAnswer: false,
  },
  {
    id: "comment-3",
    postId: "post-3",
    content: `Great questions! Here's what I asked when interviewing agencies:\n\n1. Are your staff employees or contractors?\n2. What's your backup plan if my regular aide can't come?\n3. Can I meet the specific person who will care for my parent?\n4. How do you handle complaints or concerns?\n\nMedicare does cover home health if your father meets the criteria.`,
    author: commentAuthors[1],
    createdAt: "2024-12-14T11:30:00Z",
    updatedAt: "2024-12-14T11:30:00Z",
    likeCount: 15,
    isAcceptedAnswer: true,
  },
  {
    id: "comment-4",
    postId: "post-8",
    content: `Oh this brings back memories. My mom did the exact same thing - daily crying calls for about 6 weeks. I was so close to bringing her home.\n\nBut the staff encouraged me to give it time. When I came back after two weeks, she had made a friend and was participating in activities.\n\nIt's been a year now and she tells me she's glad she moved. Hang in there.`,
    author: commentAuthors[0],
    createdAt: "2024-12-08T18:30:00Z",
    updatedAt: "2024-12-08T18:30:00Z",
    likeCount: 28,
    isAcceptedAnswer: true,
  },
  {
    id: "comment-5",
    postId: "post-13",
    content: `I could have written this post two years ago. Please know that snapping doesn't make you a terrible daughter - it makes you human.\n\nWhat helped me:\n- Joining a caregiver support group\n- Getting respite care even just 4 hours a week\n- Therapy specifically for caregiver stress\n- Letting go of the guilt about not being perfect\n\nYou're doing an incredible job even when it doesn't feel like it.`,
    author: commentAuthors[0],
    createdAt: "2024-12-03T13:30:00Z",
    updatedAt: "2024-12-03T13:30:00Z",
    likeCount: 45,
    isAcceptedAnswer: false,
  },
  {
    id: "comment-6",
    postId: "post-13",
    content: `As a geriatric care manager, I want to validate everything you're feeling. Caregiver burnout is a serious condition that affects millions of family caregivers.\n\nPlease consider:\n- Respite care programs\n- Adult day programs for your mom\n- Care management services\n- Speaking with your own doctor\n\nThe Caregiver Action Network (1-855-227-3640) has a free helpline. You matter too.`,
    author: commentAuthors[3],
    createdAt: "2024-12-03T17:45:00Z",
    updatedAt: "2024-12-03T17:45:00Z",
    likeCount: 31,
    isAcceptedAnswer: true,
  },
];

export function getCommentsByPostId(postId: string): ForumComment[] {
  const comments = mockForumComments.filter((c) => c.postId === postId);
  const topLevel = comments.filter((c) => !c.parentId);
  return topLevel.map((comment) => ({
    ...comment,
    replies: comments.filter((c) => c.parentId === comment.id),
  }));
}

export function getCommentCount(postId: string): number {
  return mockForumComments.filter((c) => c.postId === postId).length;
}
