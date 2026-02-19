"""
Alerts API - User notification preferences and alert management
"""
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import logging
from datetime import datetime

from app.database.session import get_db

router = APIRouter()
logger = logging.getLogger(__name__)

_ALERTS_TABLE_ENSURED = False

def _ensure_alerts_table(db: Session):
    """Create alerts table if it doesn't exist (runs once per process)."""
    global _ALERTS_TABLE_ENSURED
    if _ALERTS_TABLE_ENSURED:
        return
    try:
        db.execute(text("""
            CREATE TABLE IF NOT EXISTS alerts (
                id SERIAL PRIMARY KEY,
                user_email VARCHAR(255) NOT NULL,
                alert_type VARCHAR(50) NOT NULL,
                alert_name VARCHAR(255) NOT NULL,
                conditions JSONB DEFAULT '{}',
                status VARCHAR(20) DEFAULT 'active',
                email_enabled BOOLEAN DEFAULT TRUE,
                telegram_enabled BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT NOW(),
                last_triggered_at TIMESTAMP,
                trigger_count INTEGER DEFAULT 0
            )
        """))
        db.commit()
        _ALERTS_TABLE_ENSURED = True
        logger.info("Alerts table ensured")
    except Exception as e:
        db.rollback()
        logger.error(f"Error ensuring alerts table: {e}")


class AlertCreate(BaseModel):
    user_email: str  # plain str to avoid email-validator dependency
    alert_type: str  # 'arbitrage', 'price_movement', 'market_close', 'new_market'
    alert_name: str
    conditions: Dict[str, Any]
    email_enabled: bool = True
    telegram_enabled: bool = False


class Alert(BaseModel):
    id: int
    user_email: str
    alert_type: str
    alert_name: str
    conditions: Dict[str, Any]
    status: str
    email_enabled: bool
    telegram_enabled: bool
    created_at: datetime
    last_triggered_at: Optional[datetime] = None
    trigger_count: int

    class Config:
        from_attributes = True


@router.post("/", response_model=Alert)
async def create_alert(alert: AlertCreate, db: Session = Depends(get_db)):
    """Create a new alert"""
    import json

    try:
        _ensure_alerts_table(db)
        query = text("""
            INSERT INTO alerts (
                user_email, alert_type, alert_name, conditions,
                email_enabled, telegram_enabled
            )
            VALUES (
                :user_email, :alert_type, :alert_name, :conditions,
                :email_enabled, :telegram_enabled
            )
            RETURNING id, user_email, alert_type, alert_name, conditions,
                      status, email_enabled, telegram_enabled, created_at,
                      last_triggered_at, trigger_count
        """)
        
        result = db.execute(query, {
            "user_email": alert.user_email,
            "alert_type": alert.alert_type,
            "alert_name": alert.alert_name,
            "conditions": json.dumps(alert.conditions),
            "email_enabled": alert.email_enabled,
            "telegram_enabled": alert.telegram_enabled,
        })
        db.commit()
        
        row = result.fetchone()
        
        # Send confirmation email if email notifications are enabled
        if alert.email_enabled:
            try:
                from app.services.email_service import send_alert_confirmation_email
                await send_alert_confirmation_email(
                    to_email=alert.user_email,
                    alert_name=alert.alert_name,
                    alert_type=alert.alert_type,
                    conditions=alert.conditions
                )
            except Exception as email_error:
                logger.warning(f"Failed to send confirmation email: {email_error}")
                # Don't fail the alert creation if email fails
        
        return Alert(
            id=row.id,
            user_email=row.user_email,
            alert_type=row.alert_type,
            alert_name=row.alert_name,
            conditions=row.conditions,
            status=row.status,
            email_enabled=row.email_enabled,
            telegram_enabled=row.telegram_enabled,
            created_at=row.created_at,
            last_triggered_at=row.last_triggered_at,
            trigger_count=row.trigger_count,
        )
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating alert: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/", response_model=List[Alert])
async def list_alerts(
    user_email: Optional[str] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """List all alerts, optionally filtered by user_email or status"""
    try:
        _ensure_alerts_table(db)
        query = "SELECT * FROM alerts WHERE 1=1"
        params = {}
        
        if user_email:
            query += " AND user_email = :user_email"
            params["user_email"] = user_email
        
        if status:
            query += " AND status = :status"
            params["status"] = status
        
        query += " ORDER BY created_at DESC"
        
        result = db.execute(text(query), params)
        alerts = []
        
        for row in result:
            alerts.append(Alert(
                id=row.id,
                user_email=row.user_email,
                alert_type=row.alert_type,
                alert_name=row.alert_name,
                conditions=row.conditions,
                status=row.status,
                email_enabled=row.email_enabled,
                telegram_enabled=row.telegram_enabled,
                created_at=row.created_at,
                last_triggered_at=row.last_triggered_at,
                trigger_count=row.trigger_count,
            ))
        
        return alerts
    except Exception as e:
        logger.error(f"Error listing alerts: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{alert_id}")
async def delete_alert(alert_id: int, db: Session = Depends(get_db)):
    """Delete an alert by ID"""
    try:
        _ensure_alerts_table(db)
        query = text("DELETE FROM alerts WHERE id = :alert_id")
        result = db.execute(query, {"alert_id": alert_id})
        db.commit()
        
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Alert not found")
        
        return {"message": "Alert deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting alert: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/{alert_id}/status")
async def update_alert_status(
    alert_id: int,
    status: str,
    db: Session = Depends(get_db)
):
    """Update alert status (active, paused, triggered)"""
    try:
        _ensure_alerts_table(db)
        query = text("""
            UPDATE alerts
            SET status = :status, updated_at = CURRENT_TIMESTAMP
            WHERE id = :alert_id
            RETURNING id
        """)
        result = db.execute(query, {"alert_id": alert_id, "status": status})
        db.commit()
        
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Alert not found")
        
        return {"message": f"Alert status updated to {status}"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating alert status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/check")
async def check_alerts(db: Session = Depends(get_db)):
    """
    Check all active alerts and trigger notifications if conditions are met
    This endpoint would be called by a background scheduler
    """
    try:
        from app.api.arbitrage import get_arbitrage_opportunities
        from app.services.email_service import send_alert_email
        
        _ensure_alerts_table(db)
        
        # Get all active alerts
        query = text("SELECT * FROM alerts WHERE status = 'active'")
        result = db.execute(query)
        alerts = list(result)
        
        triggered_count = 0
        
        for alert in alerts:
            try:
                if alert.alert_type == 'arbitrage':
                    # Fetch current arbitrage opportunities
                    arb_response = await get_arbitrage_opportunities(
                        min_spread=alert.conditions.get('min_spread', 10),
                        min_match_score=alert.conditions.get('min_match_score', 0.5),
                        limit=10,
                        db=db
                    )
                    
                    # Check if any opportunities meet the alert criteria
                    matching_opps = []
                    for opp in arb_response.opportunities:
                        if opp.spread_percent >= alert.conditions.get('min_spread', 10):
                            if alert.conditions.get('min_confidence'):
                                if opp.confidence == alert.conditions.get('min_confidence'):
                                    matching_opps.append(opp)
                            else:
                                matching_opps.append(opp)
                    
                    if matching_opps and alert.email_enabled:
                        # Send email notification
                        await send_alert_email(
                            to_email=alert.user_email,
                            alert_name=alert.alert_name,
                            opportunities=matching_opps[:5]  # Send top 5
                        )
                        
                        # Update alert tracking
                        update_query = text("""
                            UPDATE alerts
                            SET last_triggered_at = CURRENT_TIMESTAMP,
                                trigger_count = trigger_count + 1
                            WHERE id = :alert_id
                        """)
                        db.execute(update_query, {"alert_id": alert.id})
                        db.commit()
                        
                        triggered_count += 1
                        logger.info(f"Alert {alert.id} triggered: {len(matching_opps)} opportunities")
            
            except Exception as e:
                logger.error(f"Error processing alert {alert.id}: {e}")
                continue
        
        return {
            "message": f"Alert check complete",
            "total_alerts": len(alerts),
            "triggered": triggered_count
        }
    
    except Exception as e:
        logger.error(f"Error checking alerts: {e}")
        raise HTTPException(status_code=500, detail=str(e))
