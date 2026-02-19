/**
 * Example: Integrating X402 into existing Agent Detail page
 * 
 * This shows how to add X402 payment option alongside credit-based payments
 */

import React, { useState } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Stack,
  Chip,
  Divider,
  ToggleButtonGroup,
  ToggleButton,
} from '@mui/material';
import { Payment, AccountBalance } from '@mui/icons-material';
import { X402AgentRunButton } from '@/components/X402AgentRunButton';

// Mock data - replace with your actual agent data
interface Agent {
  id: string;
  name: string;
  description: string;
  category: string;
  cost: number;
}

export const AgentDetailWithX402: React.FC = () => {
  const [paymentMethod, setPaymentMethod] = useState<'credits' | 'x402'>('x402');
  
  // Example agent data
  const agent: Agent = {
    id: 'market-analysis',
    name: 'Market Analysis Agent',
    description: 'Deep analysis of cryptocurrency markets using multiple data sources',
    category: 'Analysis',
    cost: 0.05,
  };

  const [query, setQuery] = useState('Analyze Bitcoin price trends');

  const handlePaymentMethodChange = (
    event: React.MouseEvent<HTMLElement>,
    newMethod: 'credits' | 'x402' | null,
  ) => {
    if (newMethod !== null) {
      setPaymentMethod(newMethod);
    }
  };

  const handleX402Success = (result: any) => {
    console.log('X402 Agent execution successful:', result);
    // Show success notification
    // Update UI with agent result
    alert(`Agent completed! Result: ${JSON.stringify(result.result)}`);
  };

  const handleX402Error = (error: Error) => {
    console.error('X402 Agent execution failed:', error);
    // Show error notification
    alert(`Agent failed: ${error.message}`);
  };

  const handleCreditsRun = async () => {
    // Your existing credit-based agent execution
    console.log('Running agent with credits...');
    // Call your existing API endpoint
    // await fetch('/api/agents/run', { method: 'POST', ... });
  };

  return (
    <Box sx={{ maxWidth: 800, mx: 'auto', p: 3 }}>
      <Card>
        <CardContent>
          {/* Agent Info */}
          <Stack direction="row" spacing={2} alignItems="center" mb={2}>
            <Typography variant="h5">{agent.name}</Typography>
            <Chip label={agent.category} size="small" color="primary" />
            <Chip label={`$${agent.cost}`} size="small" color="secondary" />
          </Stack>

          <Typography variant="body2" color="text.secondary" paragraph>
            {agent.description}
          </Typography>

          <Divider sx={{ my: 3 }} />

          {/* Query Input */}
          <Typography variant="subtitle2" gutterBottom>
            Query:
          </Typography>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '12px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '14px',
              marginBottom: '24px',
            }}
            placeholder="Enter your query..."
          />

          {/* Payment Method Toggle */}
          <Typography variant="subtitle2" gutterBottom>
            Payment Method:
          </Typography>
          <ToggleButtonGroup
            value={paymentMethod}
            exclusive
            onChange={handlePaymentMethodChange}
            sx={{ mb: 3 }}
            fullWidth
          >
            <ToggleButton value="x402">
              <Payment sx={{ mr: 1 }} />
              X402 Pay-per-use
              <Chip label="NEW" size="small" color="success" sx={{ ml: 1 }} />
            </ToggleButton>
            <ToggleButton value="credits">
              <AccountBalance sx={{ mr: 1 }} />
              Prepaid Credits
            </ToggleButton>
          </ToggleButtonGroup>

          {/* Payment Method Explanation */}
          <Box sx={{ mb: 3, p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
            {paymentMethod === 'x402' ? (
              <>
                <Typography variant="body2" fontWeight="bold" gutterBottom>
                  💡 X402 Pay-per-use
                </Typography>
                <Typography variant="caption" display="block">
                  • No upfront payment required
                </Typography>
                <Typography variant="caption" display="block">
                  • Pay exactly ${agent.cost} when you run the agent
                </Typography>
                <Typography variant="caption" display="block">
                  • One signature in MetaMask (no gas fees for you)
                </Typography>
                <Typography variant="caption" display="block">
                  • Payment settled on-chain by platform
                </Typography>
              </>
            ) : (
              <>
                <Typography variant="body2" fontWeight="bold" gutterBottom>
                  💰 Prepaid Credits
                </Typography>
                <Typography variant="caption" display="block">
                  • Purchase credits in advance
                </Typography>
                <Typography variant="caption" display="block">
                  • Instant agent execution (no payment flow)
                </Typography>
                <Typography variant="caption" display="block">
                  • Bulk discounts available
                </Typography>
                <Typography variant="caption" display="block">
                  • Credits never expire
                </Typography>
              </>
            )}
          </Box>

          {/* Action Buttons */}
          {paymentMethod === 'x402' ? (
            <X402AgentRunButton
              agentId={agent.id}
              agentName={agent.name}
              query={query}
              network="base"
              onSuccess={handleX402Success}
              onError={handleX402Error}
              disabled={!query.trim()}
            />
          ) : (
            <button
              onClick={handleCreditsRun}
              disabled={!query.trim()}
              style={{
                width: '100%',
                padding: '12px',
                backgroundColor: '#1976d2',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                fontSize: '14px',
                fontWeight: 'bold',
                cursor: 'pointer',
              }}
            >
              Run with Credits (${agent.cost})
            </button>
          )}
        </CardContent>
      </Card>

      {/* Info Cards */}
      <Stack direction="row" spacing={2} mt={3}>
        <Card sx={{ flex: 1 }}>
          <CardContent>
            <Typography variant="subtitle2" gutterBottom>
              ⚡ Execution Time
            </Typography>
            <Typography variant="body2" color="text.secondary">
              ~2-5 seconds
            </Typography>
          </CardContent>
        </Card>

        <Card sx={{ flex: 1 }}>
          <CardContent>
            <Typography variant="subtitle2" gutterBottom>
              🔐 Security
            </Typography>
            <Typography variant="body2" color="text.secondary">
              EIP-3009 signed authorization
            </Typography>
          </CardContent>
        </Card>

        <Card sx={{ flex: 1 }}>
          <CardContent>
            <Typography variant="subtitle2" gutterBottom>
              💳 Network
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Base (low fees)
            </Typography>
          </CardContent>
        </Card>
      </Stack>
    </Box>
  );
};

export default AgentDetailWithX402;
