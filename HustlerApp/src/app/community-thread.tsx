import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, router } from 'expo-router';
import { useEffect, useState } from 'react';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Colors } from '@/constants/theme';
import { supabase } from '../lib/supabase';
import { containsBlockedWords, formatTimeAgo, getOrCreateUsername, TOPIC_ICONS } from '../lib/community';

const showAlert = (title: string, message: string) => {
  if (typeof window !== 'undefined') {
    window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
};

const showConfirm = (title: string, message: string, onConfirm: () => void) => {
  if (typeof window !== 'undefined') {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
  } else {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'OK', style: 'destructive', onPress: onConfirm },
    ]);
  }
};

const HIDE_THRESHOLD = 3;

export default function ThreadScreen() {
  const { postId } = useLocalSearchParams();
  const [post, setPost] = useState<any>(null);
  const [replies, setReplies] = useState<any[]>([]);
  const [usernames, setUsernames] = useState<Record<string, string>>({});
  const [user, setUser] = useState<any>(null);
  const [replyText, setReplyText] = useState('');
  const [liked, setLiked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [reportedPostIds, setReportedPostIds] = useState<Set<string>>(new Set());
  const [reportedReplyIds, setReportedReplyIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadThread();
  }, [postId]);

  const loadThread = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    const currentUser = session?.user ?? null;
    setUser(currentUser);

    const { data: postData } = await supabase
      .from('community_posts')
      .select('*')
      .eq('id', postId)
      .single();
    setPost(postData);

    const { data: repliesData } = await supabase
      .from('post_replies')
      .select('*')
      .eq('post_id', postId)
      .order('created_at', { ascending: true });
    setReplies(repliesData ?? []);

    const userIds = new Set<string>();
    if (postData) userIds.add(postData.user_id);
    (repliesData ?? []).forEach((r: any) => userIds.add(r.user_id));

    const namesMap: Record<string, string> = {};
    for (const uid of userIds) {
      const { data: u } = await supabase
        .from('usernames')
        .select('username')
        .eq('user_id', uid)
        .single();
      if (u?.username) namesMap[uid] = u.username;
    }
    setUsernames(namesMap);

    if (currentUser) {
      const { data: likeData } = await supabase
        .from('post_likes')
        .select('id')
        .eq('post_id', postId)
        .eq('user_id', currentUser.id)
        .single();
      setLiked(!!likeData);

      // Load what this user has already reported
      const { data: myReports } = await supabase
        .from('post_reports')
        .select('post_id, reply_id')
        .eq('reported_by', currentUser.id);

      if (myReports) {
        const pIds = new Set(myReports.filter((r: any) => r.post_id).map((r: any) => r.post_id));
        const rIds = new Set(myReports.filter((r: any) => r.reply_id).map((r: any) => r.reply_id));
        setReportedPostIds(pIds);
        setReportedReplyIds(rIds);
      }
    }

    setLoading(false);
  };

  const goBack = () => {
    if (typeof window !== 'undefined') {
      window.history.back();
    } else {
      router.back();
    }
  };

  const toggleLike = async () => {
    if (!user) {
      showAlert('Sign in required', 'Please sign in to like posts.');
      return;
    }
    if (liked) {
      await supabase.from('post_likes').delete().eq('post_id', postId).eq('user_id', user.id);
      await supabase.from('community_posts').update({ likes_count: Math.max((post.likes_count ?? 1) - 1, 0) }).eq('id', postId);
      setLiked(false);
      setPost({ ...post, likes_count: Math.max((post.likes_count ?? 1) - 1, 0) });
    } else {
      await supabase.from('post_likes').insert({ post_id: postId, user_id: user.id });
      await supabase.from('community_posts').update({ likes_count: (post.likes_count ?? 0) + 1 }).eq('id', postId);
      setLiked(true);
      setPost({ ...post, likes_count: (post.likes_count ?? 0) + 1 });
    }
  };

  const submitReply = async () => {
    if (!replyText.trim()) return;
    if (!user) {
      showAlert('Sign in required', 'Please sign in to reply.');
      return;
    }
    if (containsBlockedWords(replyText)) {
      showAlert('Inappropriate content', 'Your reply contains language that isn\'t allowed. Please keep it respectful.');
      return;
    }

    setPosting(true);
    await getOrCreateUsername(user.id);

    const { data: inserted } = await supabase.from('post_replies').insert({
      post_id: postId,
      user_id: user.id,
      body: replyText.trim(),
    }).select();

    await supabase.from('community_posts').update({ reply_count: (post.reply_count ?? 0) + 1 }).eq('id', postId);

    if (inserted && inserted[0]) {
      setReplies([...replies, inserted[0]]);
      setUsernames({ ...usernames, [user.id]: usernames[user.id] });
      setPost({ ...post, reply_count: (post.reply_count ?? 0) + 1 });
    }
    setReplyText('');
    setPosting(false);
  };

  // Report a post: if content has blocked words, hide immediately.
  // Otherwise increment report_count and hide once it hits the threshold.
  const reportPost = () => {
    if (reportedPostIds.has(postId as string)) return;

    showConfirm('Report this post?', 'This will flag the post for review.', async () => {
      if (!user) return;

      await supabase.from('post_reports').insert({
        post_id: postId,
        reported_by: user.id,
        reason: 'User reported',
      });

      setReportedPostIds(new Set([...reportedPostIds, postId as string]));

      const contentFlagged = containsBlockedWords(post.title) || containsBlockedWords(post.body);
      const newCount = (post.report_count ?? 0) + 1;
      const shouldHide = contentFlagged || newCount >= HIDE_THRESHOLD;

      await supabase
        .from('community_posts')
        .update({ report_count: newCount, is_hidden: shouldHide })
        .eq('id', postId);

      setPost({ ...post, report_count: newCount, is_hidden: shouldHide });
      showAlert('Reported', 'Thank you. Our team will review this content.');

      if (shouldHide) {
        showAlert('Content removed', 'This post has been hidden pending review.');
        goBack();
      }
    });
  };

  const reportReply = (reply: any) => {
    if (reportedReplyIds.has(reply.id)) return;

    showConfirm('Report this reply?', 'This will flag the reply for review.', async () => {
      if (!user) return;

      await supabase.from('post_reports').insert({
        reply_id: reply.id,
        reported_by: user.id,
        reason: 'User reported',
      });

      setReportedReplyIds(new Set([...reportedReplyIds, reply.id]));

      const contentFlagged = containsBlockedWords(reply.body);
      if (contentFlagged) {
        await supabase.from('post_replies').delete().eq('id', reply.id);
        setReplies(replies.filter((r) => r.id !== reply.id));
        await supabase.from('community_posts').update({ reply_count: Math.max((post.reply_count ?? 1) - 1, 0) }).eq('id', postId);
        setPost({ ...post, reply_count: Math.max((post.reply_count ?? 1) - 1, 0) });
        showAlert('Reply removed', 'This reply violated our guidelines and has been removed.');
      } else {
        showAlert('Reported', 'Thank you. Our team will review this content.');
      }
    });
  };

  const deletePost = () => {
    showConfirm('Delete Post', 'Are you sure you want to delete this post?', async () => {
      await supabase.from('community_posts').delete().eq('id', postId);
      goBack();
    });
  };

  const deleteReply = (replyId: string) => {
    showConfirm('Delete Reply', 'Are you sure you want to delete this reply?', async () => {
      await supabase.from('post_replies').delete().eq('id', replyId);
      setReplies(replies.filter((r) => r.id !== replyId));
      await supabase.from('community_posts').update({ reply_count: Math.max((post.reply_count ?? 1) - 1, 0) }).eq('id', postId);
      setPost({ ...post, reply_count: Math.max((post.reply_count ?? 1) - 1, 0) });
    });
  };

  if (loading) {
    return (
      <LinearGradient colors={[Colors.backgroundTop, Colors.backgroundBottom]} style={styles.container}>
        <Text style={styles.emptyText}>Loading...</Text>
      </LinearGradient>
    );
  }

  if (!post) {
    return (
      <LinearGradient colors={[Colors.backgroundTop, Colors.backgroundBottom]} style={styles.container}>
        <TouchableOpacity style={styles.backBtn} onPress={goBack}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={Colors.accent} />
        </TouchableOpacity>
        <Text style={styles.emptyText}>Post not found.</Text>
      </LinearGradient>
    );
  }

  const postReported = reportedPostIds.has(postId as string);

  return (
    <LinearGradient colors={[Colors.backgroundTop, Colors.backgroundBottom]} style={styles.container}>
      <TouchableOpacity style={styles.backBtn} onPress={goBack}>
        <MaterialCommunityIcons name="arrow-left" size={24} color={Colors.accent} />
      </TouchableOpacity>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.topicTag}>
          <MaterialCommunityIcons name={TOPIC_ICONS[post.topic] as any} size={12} color={Colors.accent} />
          <Text style={styles.topicTagText}>{post.topic}</Text>
        </View>

        <View style={styles.postHeader}>
          <View style={styles.avatarCircle}>
            <MaterialCommunityIcons name="account" size={18} color={Colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.postAuthor}>{usernames[post.user_id] ?? 'Player'}</Text>
            <Text style={styles.postTime}>{formatTimeAgo(post.created_at)}</Text>
          </View>
          {user?.id === post.user_id ? (
            <TouchableOpacity onPress={deletePost}>
              <MaterialCommunityIcons name="trash-can-outline" size={18} color="#FF6B6B" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={reportPost} disabled={postReported}>
              <MaterialCommunityIcons
                name={postReported ? 'flag' : 'flag-outline'}
                size={18}
                color={postReported ? '#888888' : Colors.textSecondary}
              />
            </TouchableOpacity>
          )}
        </View>

        <Text style={styles.postTitle}>{post.title}</Text>
        <Text style={styles.postBody}>{post.body}</Text>

        <View style={styles.postActions}>
          <TouchableOpacity style={styles.actionBtn} onPress={toggleLike}>
            <MaterialCommunityIcons
              name={liked ? 'heart' : 'heart-outline'}
              size={18}
              color={liked ? '#FF6B6B' : Colors.textSecondary}
            />
            <Text style={styles.actionText}>{post.likes_count ?? 0}</Text>
          </TouchableOpacity>
          <View style={styles.actionBtn}>
            <MaterialCommunityIcons name="comment-outline" size={18} color={Colors.textSecondary} />
            <Text style={styles.actionText}>{replies.length}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        <Text style={styles.repliesLabel}>REPLIES ({replies.length})</Text>

        {replies.length === 0 ? (
          <Text style={styles.emptyReplies}>No replies yet. Be the first to respond!</Text>
        ) : (
          replies.map((reply) => {
            const replyReported = reportedReplyIds.has(reply.id);
            return (
              <View key={reply.id} style={styles.replyCard}>
                <View style={styles.replyHeader}>
                  <View style={styles.avatarCircleSmall}>
                    <MaterialCommunityIcons name="account" size={14} color={Colors.accent} />
                  </View>
                  <Text style={styles.replyAuthor}>{usernames[reply.user_id] ?? 'Player'}</Text>
                  <Text style={styles.replyTime}>{formatTimeAgo(reply.created_at)}</Text>
                  {user?.id === reply.user_id ? (
                    <TouchableOpacity onPress={() => deleteReply(reply.id)}>
                      <MaterialCommunityIcons name="trash-can-outline" size={16} color="#FF6B6B" />
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity onPress={() => reportReply(reply)} disabled={replyReported}>
                      <MaterialCommunityIcons
                        name={replyReported ? 'flag' : 'flag-outline'}
                        size={16}
                        color={replyReported ? '#888888' : Colors.textSecondary}
                      />
                    </TouchableOpacity>
                  )}
                </View>
                <Text style={styles.replyBody}>{reply.body}</Text>
              </View>
            );
          })
        )}
      </ScrollView>

      {user && (
        <View style={styles.replyInputRow}>
          <TextInput
            style={styles.replyInput}
            placeholder="Write a reply..."
            placeholderTextColor={Colors.textSecondary}
            value={replyText}
            onChangeText={setReplyText}
            multiline
          />
          <TouchableOpacity
            style={[styles.sendBtn, posting && styles.sendBtnDisabled]}
            onPress={submitReply}
            disabled={posting}
          >
            <MaterialCommunityIcons name="send" size={18} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, paddingTop: 60 },
  backBtn: { marginBottom: 16, alignSelf: 'flex-start' },
  content: { paddingBottom: 100 },
  topicTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: Colors.accentMuted,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 12,
  },
  topicTagText: { fontSize: 11, color: Colors.accent, fontWeight: '600' },
  postHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarCircleSmall: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postAuthor: { fontSize: 13, fontWeight: '600', color: Colors.accent },
  postTime: { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
  postTitle: { fontSize: 20, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 10 },
  postBody: { fontSize: 14, color: Colors.textSecondary, lineHeight: 22, marginBottom: 16 },
  postActions: { flexDirection: 'row', gap: 20, marginBottom: 16 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionText: { fontSize: 13, color: Colors.textSecondary },
  divider: { height: 1, backgroundColor: Colors.border, marginBottom: 16 },
  repliesLabel: { fontSize: 11, fontWeight: 'bold', color: Colors.accent, letterSpacing: 1, marginBottom: 12 },
  emptyReplies: { fontSize: 13, color: Colors.textSecondary, fontStyle: 'italic' },
  replyCard: { backgroundColor: Colors.backgroundCard, borderRadius: 12, padding: 14, marginBottom: 10 },
  replyHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  replyAuthor: { fontSize: 12, fontWeight: '600', color: Colors.accent, flex: 1 },
  replyTime: { fontSize: 10, color: Colors.textSecondary },
  replyBody: { fontSize: 13, color: Colors.textPrimary, lineHeight: 19 },
  replyInputRow: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    padding: 16,
    paddingBottom: 24,
    backgroundColor: Colors.backgroundTop,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  replyInput: {
    flex: 1,
    backgroundColor: Colors.backgroundCard,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: Colors.textPrimary,
    fontSize: 13,
    maxHeight: 80,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.6 },
  emptyText: { fontSize: 14, color: Colors.textSecondary, fontStyle: 'italic', textAlign: 'center', marginTop: 40 },
});
