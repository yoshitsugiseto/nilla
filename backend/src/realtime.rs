use std::{collections::HashMap, sync::Arc};

use tokio::sync::{RwLock, broadcast};

const REALTIME_CHANNEL_CAPACITY: usize = 256;

#[derive(Clone, Default)]
pub struct RealtimeHub {
    workspace_channels: Arc<RwLock<HashMap<String, broadcast::Sender<String>>>>,
    user_channels: Arc<RwLock<HashMap<String, broadcast::Sender<String>>>>,
}

impl RealtimeHub {
    pub fn new() -> Self {
        Self::default()
    }

    pub async fn subscribe_workspace(
        &self,
        workspace_id: &str,
    ) -> broadcast::Receiver<String> {
        let sender = self
            .get_or_create_sender(&self.workspace_channels, workspace_id)
            .await;
        sender.subscribe()
    }

    pub async fn subscribe_user(&self, user_id: &str) -> broadcast::Receiver<String> {
        let sender = self.get_or_create_sender(&self.user_channels, user_id).await;
        sender.subscribe()
    }

    pub async fn publish_workspace(&self, workspace_id: &str, message: String) {
        let sender = self
            .get_or_create_sender(&self.workspace_channels, workspace_id)
            .await;
        let _ = sender.send(message);
    }

    pub async fn publish_user(&self, user_id: &str, message: String) {
        let sender = self.get_or_create_sender(&self.user_channels, user_id).await;
        let _ = sender.send(message);
    }

    async fn get_or_create_sender(
        &self,
        channels: &RwLock<HashMap<String, broadcast::Sender<String>>>,
        key: &str,
    ) -> broadcast::Sender<String> {
        if let Some(sender) = channels.read().await.get(key).cloned() {
            return sender;
        }

        let mut channels = channels.write().await;
        channels
            .entry(key.to_string())
            .or_insert_with(|| broadcast::channel(REALTIME_CHANNEL_CAPACITY).0)
            .clone()
    }
}

#[cfg(test)]
mod tests {
    use tokio::sync::broadcast::error::TryRecvError;

    use super::RealtimeHub;

    #[tokio::test]
    async fn test_publish_workspace_only_reaches_matching_workspace_subscribers() {
        let hub = RealtimeHub::new();
        let mut workspace_a = hub.subscribe_workspace("workspace-a").await;
        let mut workspace_b = hub.subscribe_workspace("workspace-b").await;

        hub.publish_workspace("workspace-a", "event-a".to_string()).await;

        assert_eq!(workspace_a.recv().await.unwrap(), "event-a");
        assert!(matches!(workspace_b.try_recv(), Err(TryRecvError::Empty)));
    }

    #[tokio::test]
    async fn test_publish_user_only_reaches_matching_user_subscribers() {
        let hub = RealtimeHub::new();
        let mut user_a = hub.subscribe_user("user-a").await;
        let mut user_b = hub.subscribe_user("user-b").await;

        hub.publish_user("user-a", "notification-a".to_string()).await;

        assert_eq!(user_a.recv().await.unwrap(), "notification-a");
        assert!(matches!(user_b.try_recv(), Err(TryRecvError::Empty)));
    }

    #[tokio::test]
    async fn test_workspace_and_user_channels_are_isolated() {
        let hub = RealtimeHub::new();
        let mut workspace = hub.subscribe_workspace("workspace-a").await;
        let mut user = hub.subscribe_user("user-a").await;

        hub.publish_workspace("workspace-a", "workspace-event".to_string()).await;
        hub.publish_user("user-a", "user-event".to_string()).await;

        assert_eq!(workspace.recv().await.unwrap(), "workspace-event");
        assert_eq!(user.recv().await.unwrap(), "user-event");
        assert!(matches!(workspace.try_recv(), Err(TryRecvError::Empty)));
        assert!(matches!(user.try_recv(), Err(TryRecvError::Empty)));
    }
}
