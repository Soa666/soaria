import axios from 'axios';

export async function sendDiscordWebhook(webhookUrl, message, username = 'Soaria Bot', avatarUrl = null) {
  if (!webhookUrl || !message) {
    return false;
  }

  try {
    const payload = {
      username: username,
      content: message,
    };

    if (avatarUrl) {
      payload.avatar_url = avatarUrl;
    }

    const response = await axios.post(webhookUrl, payload, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    return response.status === 200 || response.status === 204;
  } catch (error) {
    console.error('Error sending Discord webhook:', error);
    return false;
  }
}

export async function sendDiscordRegistrationNotification(username, email, webhookUrl, messageTemplate) {
  if (!webhookUrl) {
    return false;
  }

  // Replace template variables
  let message = messageTemplate || '🎮 **Neue Registrierung!**\n\n**Benutzername:** {{username}}\n**E-Mail:** {{email}}';
  message = message.replace(/\{\{username\}\}/g, username);
  message = message.replace(/\{\{email\}\}/g, email);

  return await sendDiscordWebhook(webhookUrl, message);
}
