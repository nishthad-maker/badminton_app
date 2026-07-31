import { View, StyleSheet, TouchableOpacity, Alert, ScrollView, Image } from 'react-native';
import { TextInput } from '@/components/TextInput';
import { Text } from '@/components/Text';
import { useLocalSearchParams, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/icons/Icon';
import { Theme, Fonts } from '@/constants/theme';
import { supabase } from '../lib/supabase';
import { containsBlockedWords, formatTimeAgo, getOrCreateUsername, avatarColorFor } from '../lib/community';

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
      showAlert('Log in required', 'Please log in to like posts.');
      return;
    }
    // We only touch the post_likes table. A database trigger keeps
    // community_posts.likes_count accurate (see the SQL migration), which
    // avoids the row-level-security block on updating other people's posts.
    if (liked) {
      setLiked(false);
      setPost({ ...post, likes_count: Math.max((post.likes_count ?? 1) - 1, 0) });
      await supabase.from('post_likes').delete().eq('post_id', postId).eq('user_id', user.id);
    } else {
      setLiked(true);
      setPost({ ...post, likes_count: (post.likes_count ?? 0) + 1 });
      await supabase.from('post_likes').insert({ post_id: postId, user_id: user.id });
    }
  };

  const submitReply = async () => {
    if (!replyText.trim()) return;
    if (!user) {
      showAlert('Log in required', 'Please log in to reply.');
      return;
    }
    if (containsBlockedWords(replyText)) {
      showAlert('Inappropriate content', 'Your reply contains language that isn\'t allowed. Please keep it respectful.');
      return;
    }

    setPosting(true);
    const myUsername = await getOrCreateUsername(user.id);

    const { data: inserted } = await supabase.from('post_replies').insert({
      post_id: postId,
      user_id: user.id,
      body: replyText.trim(),
    }).select();

    await supabase.from('community_posts').update({ reply_count: (post.reply_count ?? 0) + 1 }).eq('id', postId);

    if (inserted && inserted[0]) {
      setReplies([...replies, inserted[0]]);
      setUsernames({ ...usernames, [user.id]: myUsername });
      setPost({ ...post, reply_count: (post.reply_count ?? 0) + 1 });
    }
    setReplyText('');
    setPosting(false);
  };

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
      <View style={styles.container}>
        <Text style={styles.emptyText}>Loading...</Text>
      </View>
    );
  }

  if (!post) {
    return (
      <View style={styles.container}>
        <TouchableOpacity style={styles.backBtn} onPress={goBack}>
          <Icon name="arrow-left" size={24} color={Theme.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.emptyText}>Post not found.</Text>
      </View>
    );
  }

  const postReported = reportedPostIds.has(postId as string);

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backBtn} onPress={goBack}>
        <Icon name="arrow-left" size={24} color={Theme.textPrimary} />
      </TouchableOpacity>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.postCard}>
          <View style={styles.topicTag}>
            <Text style={styles.topicTagText}>{post.topic}</Text>
          </View>

          <View style={styles.postHeader}>
            <View style={[styles.avatarCircle, { backgroundColor: avatarColorFor(post.user_id).bg }]}>
              <Icon name="account" size={22} color={avatarColorFor(post.user_id).fg} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.postAuthor}>{usernames[post.user_id] ?? 'Player'}</Text>
              <Text style={styles.postTime}>{formatTimeAgo(post.created_at)}</Text>
            </View>
            {user?.id === post.user_id ? (
              <TouchableOpacity onPress={deletePost}>
                <Icon name="trash-can-outline" size={21} color="#E74C3C" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={reportPost} disabled={postReported}>
                <Icon
                  name={postReported ? 'flag' : 'flag-outline'}
                  size={21}
                  color={postReported ? Theme.textMuted : Theme.textSecondary}
                />
              </TouchableOpacity>
            )}
          </View>

          <Text style={styles.postTitle}>{post.title}</Text>
          <Text style={styles.postBody}>{post.body}</Text>

          {/* Post image */}
          {post.image_url && (
            <Image
              source={{ uri: post.image_url }}
              style={styles.postImage}
              resizeMode="cover"
            />
          )}

          <View style={styles.postActions}>
            <TouchableOpacity style={styles.actionBtn} onPress={toggleLike}>
              <Icon
                name={liked ? 'heart' : 'heart-outline'}
                size={18}
                color={liked ? '#E74C3C' : Theme.textSecondary}
              />
              <Text style={styles.actionText}>{post.likes_count ?? 0}</Text>
            </TouchableOpacity>
            <View style={styles.actionBtn}>
              <Icon name="comment-outline" size={18} color={Theme.textSecondary} />
              <Text style={styles.actionText}>{replies.length}</Text>
            </View>
          </View>
        </View>

        <Text style={styles.repliesLabel}>REPLIES ({replies.length})</Text>

        {replies.length === 0 ? (
          <Text style={styles.emptyReplies}>No replies yet. Be the first to respond!</Text>
        ) : (
          replies.map((reply) => {
            const replyReported = reportedReplyIds.has(reply.id);
            return (
              <View key={reply.id} style={styles.replyCard}>
                <View style={styles.replyHeader}>
                  <View style={[styles.avatarCircleSmall, { backgroundColor: avatarColorFor(reply.user_id).bg }]}>
                    <Icon name="account" size={18} color={avatarColorFor(reply.user_id).fg} />
                  </View>
                  <Text style={styles.replyAuthor}>{usernames[reply.user_id] ?? 'Player'}</Text>
                  <Text style={styles.replyTime}>{formatTimeAgo(reply.created_at)}</Text>
                  {user?.id === reply.user_id ? (
                    <TouchableOpacity onPress={() => deleteReply(reply.id)}>
                      <Icon name="trash-can-outline" size={19} color="#E74C3C" />
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity onPress={() => reportReply(reply)} disabled={replyReported}>
                      <Icon
                        name={replyReported ? 'flag' : 'flag-outline'}
                        size={19}
                        color={replyReported ? Theme.textMuted : Theme.textSecondary}
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
            placeholderTextColor={Theme.textSecondary}
            value={replyText}
            onChangeText={setReplyText}
            multiline
          />
          <TouchableOpacity
            style={[styles.sendBtn, posting && styles.sendBtnDisabled]}
            onPress={submitReply}
            disabled={posting}
          >
            <Icon name="send" size={18} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.background, padding: 24, paddingTop: 60 },
  backBtn: { marginBottom: 20, alignSelf: 'flex-start' },
  content: { paddingBottom: 110 },
  postCard: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 20,
    padding: 20,
    marginBottom: 22,
  },
  topicTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    alignSelf: 'flex-start',
    backgroundColor: '#E3D9F5',
    borderRadius: 22,
    paddingHorizontal: 13,
    paddingVertical: 6,
    marginBottom: 16,
  },
  topicTagText: { fontSize: 15, color: '#534AB7', fontWeight: '600' },
  postHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  avatarCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: Theme.cardTinted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarCircleSmall: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Theme.cardTinted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postAuthor: { fontSize: 16, fontWeight: '600', color: Theme.eyebrowGreen },
  postTime: { fontSize: 15, color: Theme.textSecondary, marginTop: 2 },
  postTitle: { fontFamily: Fonts.sansBold, fontSize: 19, color: Theme.textPrimary, marginBottom: 10, lineHeight: 25 },
  postBody: { fontSize: 15, color: Theme.textSecondary, lineHeight: 21, marginBottom: 16 },
  postImage: {
    width: '100%',
    height: 240,
    borderRadius: 14,
    marginBottom: 18,
  },
  postActions: { flexDirection: 'row', gap: 24 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  actionText: { fontSize: 14, color: Theme.textSecondary },
  repliesLabel: { fontSize: 13, fontWeight: 'bold', color: Theme.eyebrowGreen, letterSpacing: 1, marginBottom: 14 },
  emptyReplies: { fontSize: 17, color: Theme.textSecondary, fontStyle: 'italic' },
  replyCard: { backgroundColor: Theme.cardWhite, borderRadius: 16, padding: 18, marginBottom: 12 },
  replyHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  replyAuthor: { fontSize: 15, fontWeight: '600', color: Theme.eyebrowGreen, flex: 1 },
  replyTime: { fontSize: 14, color: Theme.textSecondary },
  replyBody: { fontSize: 16, color: Theme.textPrimary, lineHeight: 22 },
  replyInputRow: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
    padding: 18,
    paddingBottom: 26,
    backgroundColor: Theme.background,
    borderTopWidth: 1,
    borderTopColor: Theme.divider,
  },
  replyInput: {
    flex: 1,
    backgroundColor: Theme.cardWhite,
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 12,
    color: Theme.textPrimary,
    fontSize: 16,
    maxHeight: 90,
  },
  sendBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#534AB7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.6 },
  emptyText: { fontSize: 15, color: Theme.textSecondary, fontStyle: 'italic', textAlign: 'center', marginTop: 40 },
});
