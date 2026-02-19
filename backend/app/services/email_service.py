"""
Email notification service for alerts
Simple SMTP-based email sender
"""
import smtplib
import os
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import List, Any

logger = logging.getLogger(__name__)

# Email configuration from environment variables
SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
FROM_EMAIL = os.getenv("FROM_EMAIL", SMTP_USER)


async def send_alert_email(
    to_email: str,
    alert_name: str,
    opportunities: List[Any]
):
    """
    Send arbitrage alert email notification
    
    Args:
        to_email: Recipient email address
        alert_name: Name of the alert that triggered
        opportunities: List of arbitrage opportunities
    """
    try:
        # Create message
        msg = MIMEMultipart('alternative')
        msg['Subject'] = f"🚨 Alert: {alert_name}"
        msg['From'] = FROM_EMAIL
        msg['To'] = to_email
        
        # Create email body
        html_body = f"""
        <html>
          <head>
            <style>
              body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
              .header {{ background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                         color: white; padding: 20px; text-align: center; }}
              .content {{ padding: 20px; }}
              .opportunity {{ background: #f8f9fa; border-left: 4px solid #22c55e; 
                             padding: 15px; margin: 10px 0; border-radius: 4px; }}
              .spread {{ color: #22c55e; font-weight: bold; font-size: 1.2em; }}
              .platform {{ display: inline-block; padding: 4px 8px; margin: 2px; 
                          border-radius: 4px; font-size: 0.85em; }}
              .poly {{ background: #e9d5ff; color: #7c3aed; }}
              .kalshi {{ background: #fed7aa; color: #ea580c; }}
              .limitless {{ background: #bbf7d0; color: #15803d; }}
              .footer {{ text-align: center; padding: 20px; color: #666; font-size: 0.9em; }}
            </style>
          </head>
          <body>
            <div class="header">
              <h1>🎯 Arbitrage Alert Triggered</h1>
              <p>{alert_name}</p>
            </div>
            <div class="content">
              <p>Your alert has detected <strong>{len(opportunities)}</strong> new arbitrage opportunities:</p>
        """
        
        # Add each opportunity
        for opp in opportunities[:5]:  # Top 5
            platforms_html = ""
            for platform in opp.platforms:
                platforms_html += f'<span class="platform {platform}">{platform}</span>'
            
            html_body += f"""
              <div class="opportunity">
                <h3>{opp.title}</h3>
                <p class="spread">Spread: {opp.spread_percent:.1f}%</p>
                <p>Platforms: {platforms_html}</p>
                <p>💰 Buy at {(opp.best_buy_price * 100):.1f}¢ on <strong>{opp.best_buy_platform}</strong></p>
                <p>💵 Sell at {(opp.best_sell_price * 100):.1f}¢ on <strong>{opp.best_sell_platform}</strong></p>
                <p>Est. Profit: <strong>${opp.profit_potential:.2f}</strong></p>
              </div>
            """
        
        html_body += """
            </div>
            <div class="footer">
              <p>View all opportunities at <a href="http://localhost:5173/arbitrage">CoinGraph Prediction Terminal</a></p>
              <p><small>To manage your alerts, visit the Alerts page in your dashboard.</small></p>
            </div>
          </body>
        </html>
        """
        
        # Plain text version
        text_body = f"""
        Arbitrage Alert: {alert_name}
        
        Your alert has detected {len(opportunities)} new arbitrage opportunities:
        
        """
        
        for opp in opportunities[:5]:
            text_body += f"""
        {opp.title}
        Spread: {opp.spread_percent:.1f}%
        Buy: {(opp.best_buy_price * 100):.1f}¢ on {opp.best_buy_platform}
        Sell: {(opp.best_sell_price * 100):.1f}¢ on {opp.best_sell_platform}
        Est. Profit: ${opp.profit_potential:.2f}
        
        ---
        """
        
        text_body += """
        
        View all opportunities at http://localhost:5173/arbitrage
        """
        
        # Attach both versions
        part1 = MIMEText(text_body, 'plain')
        part2 = MIMEText(html_body, 'html')
        msg.attach(part1)
        msg.attach(part2)
        
        # Send email
        if not SMTP_USER or not SMTP_PASSWORD:
            logger.warning("SMTP credentials not configured. Email would be sent to: " + to_email)
            logger.info(f"Alert email (simulated): {alert_name} - {len(opportunities)} opportunities")
            return True
        
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.send_message(msg)
        
        logger.info(f"Alert email sent to {to_email}: {alert_name}")
        return True
        
    except Exception as e:
        logger.error(f"Error sending alert email: {e}")
        return False


async def send_alert_confirmation_email(
    to_email: str,
    alert_name: str,
    alert_type: str,
    conditions: dict
):
    """
    Send confirmation email when an alert is created
    
    Args:
        to_email: Recipient email address
        alert_name: Name of the alert
        alert_type: Type of alert (arbitrage, price_movement, etc.)
        conditions: Alert conditions
    """
    try:
        msg = MIMEMultipart('alternative')
        msg['Subject'] = f"✅ Alert Created: {alert_name}"
        msg['From'] = FROM_EMAIL
        msg['To'] = to_email
        
        # Format conditions nicely
        conditions_html = ""
        if alert_type == "arbitrage":
            min_spread = conditions.get("min_spread", "any")
            confidence = conditions.get("confidence", "any")
            conditions_html = f"""
                <li>Minimum Spread: <strong>{min_spread}%</strong></li>
                <li>Confidence Level: <strong>{confidence}</strong></li>
            """
        elif alert_type == "price_movement":
            conditions_html = "<li>Price movement thresholds configured</li>"
        elif alert_type == "market_close":
            conditions_html = "<li>Market closing notifications enabled</li>"
        else:
            conditions_html = "<li>Custom conditions configured</li>"
        
        html_body = f"""
        <html>
          <head>
            <style>
              body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
              .header {{ background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                         color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }}
              .content {{ padding: 30px; background: white; }}
              .alert-box {{ background: #f0fdf4; border-left: 4px solid #22c55e; 
                           padding: 20px; margin: 20px 0; border-radius: 4px; }}
              .conditions {{ background: #f8f9fa; padding: 15px; border-radius: 4px; margin: 15px 0; }}
              .footer {{ text-align: center; padding: 20px; background: #f8f9fa; 
                        color: #666; font-size: 0.9em; border-radius: 0 0 8px 8px; }}
              .btn {{ display: inline-block; padding: 12px 24px; background: #667eea; 
                     color: white; text-decoration: none; border-radius: 6px; margin: 10px 5px; }}
              ul {{ padding-left: 20px; }}
            </style>
          </head>
          <body>
            <div class="header">
              <h1>🎉 Alert Successfully Created!</h1>
            </div>
            <div class="content">
              <div class="alert-box">
                <h2>"{alert_name}"</h2>
                <p><strong>Alert Type:</strong> {alert_type.replace('_', ' ').title()}</p>
              </div>
              
              <h3>📋 Your Alert Conditions:</h3>
              <div class="conditions">
                <ul>
                  {conditions_html}
                </ul>
              </div>
              
              <h3>🔔 What Happens Next?</h3>
              <p>We're now monitoring prediction markets across <strong>Polymarket, Kalshi, Limitless, and OpinionTrade</strong>.</p>
              <p>When we detect opportunities matching your criteria, you'll receive an instant email notification with:</p>
              <ul>
                <li>📊 Market details and price spreads</li>
                <li>💰 Estimated profit potential</li>
                <li>🎯 Exact buy/sell platforms and prices</li>
                <li>⚡ Real-time data for quick action</li>
              </ul>
              
              <p style="margin-top: 30px; text-align: center;">
                <a href="http://localhost:5173/alerts" class="btn">Manage Your Alerts</a>
                <a href="http://localhost:5173/arbitrage" class="btn">View Live Opportunities</a>
              </p>
            </div>
            <div class="footer">
              <p><strong>CoinGraph Prediction Terminal</strong></p>
              <p>Advanced cross-platform prediction market analytics</p>
              <p style="margin-top: 15px; font-size: 0.85em;">
                Questions? Reply to this email or visit our dashboard for more options.
              </p>
            </div>
          </body>
        </html>
        """
        
        # Plain text version
        text_body = f"""
Alert Successfully Created!

Alert Name: {alert_name}
Type: {alert_type.replace('_', ' ').title()}

Your alert is now active and monitoring prediction markets across Polymarket, Kalshi, Limitless, and OpinionTrade.

You'll receive instant email notifications when opportunities matching your criteria are detected.

Manage alerts: http://localhost:5173/alerts
View opportunities: http://localhost:5173/arbitrage

-- 
CoinGraph Prediction Terminal
Advanced cross-platform prediction market analytics
        """
        
        # Attach both versions
        part1 = MIMEText(text_body, 'plain')
        part2 = MIMEText(html_body, 'html')
        msg.attach(part1)
        msg.attach(part2)
        
        # Send email
        if not SMTP_USER or not SMTP_PASSWORD:
            logger.warning("SMTP credentials not configured. Confirmation email would be sent to: " + to_email)
            logger.info(f"✅ Alert confirmation email (simulated): {alert_name}")
            print(f"\n{'='*80}")
            print(f"📧 CONFIRMATION EMAIL (Simulated - SMTP not configured)")
            print(f"{'='*80}")
            print(f"To: {to_email}")
            print(f"Subject: ✅ Alert Created: {alert_name}")
            print(f"Alert Type: {alert_type}")
            print(f"Conditions: {conditions}")
            print(f"{'='*80}\n")
            return True
        
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.send_message(msg)
        
        logger.info(f"✅ Alert confirmation email sent to {to_email}: {alert_name}")
        return True
        
    except Exception as e:
        logger.error(f"Error sending confirmation email: {e}")
        return False


async def send_test_email(to_email: str):
    """Send a test email to verify configuration"""
    try:
        msg = MIMEMultipart('alternative')
        msg['Subject'] = "Test Email from CoinGraph Prediction Terminal"
        msg['From'] = FROM_EMAIL
        msg['To'] = to_email
        
        html = """
        <html>
          <body style="font-family: Arial, sans-serif;">
            <h2>✅ Email Configuration Test</h2>
            <p>Your email notifications are working correctly!</p>
            <p>You'll receive alerts here when your conditions are met.</p>
          </body>
        </html>
        """
        
        text = "Email Configuration Test\n\nYour email notifications are working correctly!"
        
        msg.attach(MIMEText(text, 'plain'))
        msg.attach(MIMEText(html, 'html'))
        
        if not SMTP_USER or not SMTP_PASSWORD:
            logger.info(f"Test email (simulated) to: {to_email}")
            return True
        
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.send_message(msg)
        
        logger.info(f"Test email sent to {to_email}")
        return True
        
    except Exception as e:
        logger.error(f"Error sending test email: {e}")
        return False
