import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  TextField,
  InputAdornment,
  Card,
  CardContent,
  Grid,
  Stack,
  Chip,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Tabs,
  Tab,
  IconButton,
  Tooltip,
  Badge,
} from '@mui/material';
import {
  Search as SearchIcon,
  SmartToy as SmartToyIcon,
  Star as StarIcon,
  Notifications as NotificationsIcon,
  PlayArrow as PlayIcon,
  WorkspacePremium as PremiumIcon,
  Construction as ConstructionIcon,
} from '@mui/icons-material';

// Agents that are fully implemented and can be run
const ACTIVE_AGENTS = ['token-deep-dive', 'whale-movement'];

// Check if an agent is active (can be run)
const isAgentActive = (agentSlug: string): boolean => {
  return ACTIVE_AGENTS.includes(agentSlug);
};
import { Agent, fetchAgents } from '../services/agentsService';
import { getSimplePacks, getAdvancedPacks } from '../config/agents/agentPacks';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div role="tabpanel" hidden={value !== index} {...other}>
      {value === index && <Box sx={{ pt: 3 }}>{children}</Box>}
    </div>
  );
}

export const AIAgents: React.FC = () => {
  const navigate = useNavigate();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [filteredAgents, setFilteredAgents] = useState<Agent[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedModeFit, setSelectedModeFit] = useState<string>('all');
  const [selectedRuntime, setSelectedRuntime] = useState<string>('all');
  const [tabValue, setTabValue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pinnedAgents, setPinnedAgents] = useState<string[]>([]);
  
  const simplePacks = getSimplePacks();
  const advancedPacks = getAdvancedPacks();

  useEffect(() => {
    loadAgents();
    // Load pinned agents from localStorage
    const saved = localStorage.getItem('pinnedAgents');
    if (saved) {
      setPinnedAgents(JSON.parse(saved));
    }
  }, []);

  useEffect(() => {
    filterAgents();
  }, [searchQuery, selectedCategory, selectedModeFit, selectedRuntime, agents, tabValue]);

  const loadAgents = async () => {
    try {
      setLoading(true);
      const data = await fetchAgents();
      setAgents(data);
      setFilteredAgents(data);
    } catch (error) {
      console.error('Failed to load agents:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterAgents = () => {
    let filtered = agents;

    // Filter by tab
    if (tabValue === 3) {
      // My Agents - show pinned and recent
      filtered = filtered.filter((agent) => pinnedAgents.includes(agent.slug));
    }

    // Filter by search query
    if (searchQuery) {
      filtered = filtered.filter((agent) =>
        agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        agent.description.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Filter by category
    if (selectedCategory && selectedCategory !== 'all') {
      filtered = filtered.filter((agent) => agent.category === selectedCategory);
    }

    // Filter by mode fit (placeholder - will use agent registry data)
    if (selectedModeFit && selectedModeFit !== 'all') {
      // TODO: Filter by modeFit from agent registry
    }

    // Filter by runtime (placeholder)
    if (selectedRuntime && selectedRuntime !== 'all') {
      // TODO: Filter by runtime from agent registry
    }

    setFilteredAgents(filtered);
  };

  const handleAgentClick = (slug: string) => {
    navigate(`/agent-workflows/${slug}`);
  };

  const handlePinAgent = (slug: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newPinned = pinnedAgents.includes(slug)
      ? pinnedAgents.filter(s => s !== slug)
      : [...pinnedAgents, slug];
    setPinnedAgents(newPinned);
    localStorage.setItem('pinnedAgents', JSON.stringify(newPinned));
  };

  const handleRunPack = (packId: string) => {
    // TODO: Implement pack execution
    console.log('Run pack:', packId);
  };

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      blockchains: '#2196F3',
      tokens: '#9C27B0',
      cex: '#4CAF50',
      dex: '#00BCD4',
      derivatives: '#FF9800',
      'prediction-markets': '#E91E63',
      nfts: '#FF5722',
      defi: '#3F51B5',
      // Legacy support
      onchain: '#2196F3',
      exchanges: '#4CAF50',
      risk: '#F44336',
    };
    return colors[category] || '#757575';
  };

  return (
    <Box
      sx={{
        p: { xs: 2, sm: 3 },
        minHeight: 'calc(100vh - 56px)',
        backgroundColor: 'background.default',
      }}
    >
      {/* Header */}
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 0.5 }}>
        <SmartToyIcon sx={{ fontSize: 24, color: 'primary.main' }} />
        <Typography variant="h5" fontWeight={700}>
          AI Agent Workflows
        </Typography>
        <Chip 
          label={`${agents.length} agents`}
          size="small"
          color="primary" 
          variant="outlined"
          sx={{ fontWeight: 600 }}
        />
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Automated trading workflows and research agents for prediction markets
      </Typography>

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={tabValue} onChange={handleTabChange} aria-label="agent tabs">
          <Tab label="All Agents" />
          <Tab 
            label={
              <Stack direction="row" spacing={1} alignItems="center">
                <span>Simple Packs</span>
                <Chip label={simplePacks.length} size="small" sx={{ backgroundColor: 'rgba(187, 217, 119, 0.2)', color: 'rgba(187, 217, 119, 1)' }} />
              </Stack>
            }
          />
          <Tab 
            label={
              <Stack direction="row" spacing={1} alignItems="center">
                <span>Advanced Packs</span>
                <Chip label={advancedPacks.length} size="small" sx={{ backgroundColor: 'rgba(187, 217, 119, 0.3)', color: 'rgba(187, 217, 119, 1)' }} />
              </Stack>
            }
          />
          <Tab 
            label={
              <Stack direction="row" spacing={1} alignItems="center">
                <span>My Agents</span>
                {pinnedAgents.length > 0 && (
                  <Badge badgeContent={pinnedAgents.length} color="primary" />
                )}
              </Stack>
            }
          />
        </Tabs>
      </Box>

      {/* Search and Filter */}
      <Box sx={{ mb: 3 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField
            fullWidth
            placeholder="Search agents... (e.g., funding, whale, token safety)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
            sx={{ 
              flex: 1,
              '& .MuiOutlinedInput-root': {
                borderRadius: '8px',
              },
            }}
          />
          <FormControl sx={{ minWidth: 180 }}>
            <InputLabel>Category</InputLabel>
            <Select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              label="Category"
              sx={{ borderRadius: '8px' }}
            >
              <MenuItem value="all">All Categories</MenuItem>
              <MenuItem value="blockchains">⛓️ Blockchains</MenuItem>
              <MenuItem value="tokens">🪙 Tokens</MenuItem>
              <MenuItem value="cex">🏦 CEX</MenuItem>
              <MenuItem value="dex">🔄 DEX</MenuItem>
              <MenuItem value="derivatives">⚡ Derivatives</MenuItem>
              <MenuItem value="prediction-markets">🎯 Predictions</MenuItem>
              <MenuItem value="nfts">🖼️ NFTs</MenuItem>
              <MenuItem value="defi">🏛️ DeFi</MenuItem>
            </Select>
          </FormControl>
          <FormControl sx={{ minWidth: 160 }}>
            <InputLabel>Mode Fit</InputLabel>
            <Select
              value={selectedModeFit}
              onChange={(e) => setSelectedModeFit(e.target.value)}
              label="Mode Fit"
              sx={{ borderRadius: '8px' }}
            >
              <MenuItem value="all">All Modes</MenuItem>
              <MenuItem value="simple-friendly">Simple Friendly</MenuItem>
              <MenuItem value="advanced-grade">Advanced Grade</MenuItem>
              <MenuItem value="both">Both</MenuItem>
            </Select>
          </FormControl>
          <FormControl sx={{ minWidth: 140 }}>
            <InputLabel>Runtime</InputLabel>
            <Select
              value={selectedRuntime}
              onChange={(e) => setSelectedRuntime(e.target.value)}
              label="Runtime"
              sx={{ borderRadius: '8px' }}
            >
              <MenuItem value="all">All Speeds</MenuItem>
              <MenuItem value="fast">⚡ Fast</MenuItem>
              <MenuItem value="medium">⏱️ Medium</MenuItem>
              <MenuItem value="heavy">🐌 Heavy</MenuItem>
            </Select>
          </FormControl>
        </Stack>
      </Box>

      {/* Agents Grid */}
      <TabPanel value={tabValue} index={0}>
        {loading ? (
          <Typography textAlign="center" color="text.secondary" py={4}>
            Loading agents...
          </Typography>
        ) : filteredAgents.length === 0 ? (
          <Typography textAlign="center" color="text.secondary" py={4}>
            No agents found
          </Typography>
        ) : (
          <Grid container spacing={3}>
            {filteredAgents.map((agent) => (
              <Grid item xs={12} sm={6} md={4} key={agent.id}>
                <Card
                  sx={{
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    cursor: 'pointer',
                    transition: 'all 0.3s ease',
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '16px',
                    position: 'relative',
                    '&:hover': {
                      transform: 'translateY(-4px)',
                      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)',
                      borderColor: 'primary.main',
                      '& .agent-actions': {
                        opacity: 1,
                      },
                    },
                  }}
                  onClick={() => handleAgentClick(agent.slug)}
                >
                  {/* Action Buttons */}
                  <Box
                    className="agent-actions"
                    sx={{
                      position: 'absolute',
                      top: 12,
                      right: 12,
                      display: 'flex',
                      gap: 1,
                      opacity: 0,
                      transition: 'opacity 0.3s ease',
                      zIndex: 2,
                    }}
                  >
                    <Tooltip title={pinnedAgents.includes(agent.slug) ? "Unpin" : "Pin"}>
                      <IconButton
                        size="small"
                        onClick={(e) => handlePinAgent(agent.slug, e)}
                        sx={{
                          bgcolor: 'background.paper',
                          '&:hover': { bgcolor: 'primary.main' },
                        }}
                      >
                        <StarIcon
                          fontSize="small"
                          sx={{ 
                            color: pinnedAgents.includes(agent.slug) ? '#FFD700' : 'inherit' 
                          }}
                        />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Set Alert">
                      <IconButton
                        size="small"
                        onClick={(e) => { e.stopPropagation(); /* TODO */ }}
                        sx={{
                          bgcolor: 'background.paper',
                          '&:hover': { bgcolor: 'primary.main' },
                        }}
                      >
                        <NotificationsIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>

                  <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', p: 3 }}>
                    <Stack direction="row" spacing={2} alignItems="center" mb={2}>
                      <Box
                        sx={{
                          fontSize: '48px',
                          width: '64px',
                          height: '64px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: 2,
                          backgroundColor: 'rgba(187, 217, 119, 0.1)',
                        }}
                      >
                        {agent.icon}
                      </Box>
                      <Box flex={1}>
                        <Typography variant="h6" fontWeight="bold" gutterBottom>
                          {agent.name}
                        </Typography>
                        <Stack direction="row" spacing={1} flexWrap="wrap">
                          <Chip
                            label={agent.category}
                            size="small"
                            sx={{
                              backgroundColor: getCategoryColor(agent.category),
                              color: 'white',
                              textTransform: 'capitalize',
                            }}
                          />
                        </Stack>
                      </Box>
                    </Stack>

                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{
                        flex: 1,
                        display: '-webkit-box',
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        mb: 2,
                      }}
                    >
                      {agent.description}
                    </Typography>

                    <Stack direction="row" spacing={1} justifyContent="space-between" alignItems="center">
                      {isAgentActive(agent.slug) ? (
                        <>
                          <Typography
                            variant="button"
                            color="primary"
                            sx={{ fontWeight: 'bold' }}
                          >
                            RUN AGENT →
                          </Typography>
                          <Chip
                            label="$0.20"
                            size="small"
                            variant="outlined"
                            sx={{
                              borderColor: 'rgba(187, 217, 119, 0.6)',
                              color: 'rgba(187, 217, 119, 1)',
                              fontWeight: 600
                            }}
                          />
                        </>
                      ) : (
                        <>
                          <Typography
                            variant="button"
                            color="text.secondary"
                            sx={{ fontWeight: 'bold' }}
                          >
                            VIEW DETAILS →
                          </Typography>
                          <Chip
                            icon={<ConstructionIcon sx={{ fontSize: '14px !important', color: 'rgba(187, 217, 119, 0.7)' }} />}
                            label="Coming Soon"
                            size="small"
                            variant="outlined"
                            sx={{
                              borderColor: 'rgba(187, 217, 119, 0.5)',
                              color: 'rgba(187, 217, 119, 0.9)',
                              '& .MuiChip-icon': { color: 'rgba(187, 217, 119, 0.7)' }
                            }}
                          />
                        </>
                      )}
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}
      </TabPanel>

      {/* Simple Packs Tab */}
      <TabPanel value={tabValue} index={1}>
        <Grid container spacing={3}>
          {simplePacks.map((pack) => (
            <Grid item xs={12} md={6} key={pack.id}>
              <Card
                sx={{
                  background: 'linear-gradient(135deg, rgba(187, 217, 119, 0.08) 0%, rgba(187, 217, 119, 0.03) 100%)',
                  border: '1px solid rgba(187, 217, 119, 0.25)',
                  borderRadius: '16px',
                  cursor: 'default',
                  opacity: 0.8,
                  transition: 'all 0.3s ease',
                  '&:hover': {
                    transform: 'translateY(-2px)',
                    boxShadow: '0 4px 12px rgba(187, 217, 119, 0.15)',
                  },
                }}
              >
                <CardContent sx={{ p: 3 }}>
                  <Stack direction="row" spacing={2} alignItems="flex-start" mb={2}>
                    <Typography variant="h2">{pack.icon}</Typography>
                    <Box flex={1}>
                      <Typography variant="h6" fontWeight="bold" gutterBottom>
                        {pack.name}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" mb={2}>
                        {pack.description}
                      </Typography>
                      <Stack direction="row" spacing={1} flexWrap="wrap" mb={2}>
                        {pack.agentIds.slice(0, 3).map((agentId, idx) => {
                          const formattedName = agentId
                            .split('-')
                            .map((w) => {
                              return w.charAt(0).toUpperCase() + w.slice(1);
                            })
                            .join(' ');
                          return (
                            <Chip
                              key={idx}
                              label={formattedName}
                              size="small"
                              variant="outlined"
                              sx={{ borderColor: 'rgba(187, 217, 119, 0.35)', color: 'rgba(187, 217, 119, 0.85)' }}
                            />
                          );
                        })}
                        {pack.agentIds.length > 3 && (
                          <Chip
                            label={`+${pack.agentIds.length - 3} more`}
                            size="small"
                            variant="outlined"
                            sx={{ borderColor: 'rgba(187, 217, 119, 0.3)', color: 'rgba(187, 217, 119, 0.7)' }}
                          />
                        )}
                      </Stack>
                      <Stack direction="row" spacing={2} alignItems="center">
                        <Chip
                          icon={<ConstructionIcon sx={{ color: 'rgba(187, 217, 119, 0.7)' }} />}
                          label="Coming Soon"
                          variant="outlined"
                          sx={{
                            fontWeight: 600,
                            borderColor: 'rgba(187, 217, 119, 0.5)',
                            color: 'rgba(187, 217, 119, 0.9)',
                            '& .MuiChip-icon': { color: 'rgba(187, 217, 119, 0.7)' }
                          }}
                        />
                        <Typography variant="caption" color="text.secondary">
                          {pack.agentIds.length} agents included
                        </Typography>
                      </Stack>
                    </Box>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </TabPanel>

      {/* Advanced Packs Tab */}
      <TabPanel value={tabValue} index={2}>
        <Grid container spacing={3}>
          {advancedPacks.map((pack) => (
            <Grid item xs={12} md={6} key={pack.id}>
              <Card
                sx={{
                  background: 'linear-gradient(135deg, rgba(187, 217, 119, 0.12) 0%, rgba(187, 217, 119, 0.05) 100%)',
                  border: '1px solid rgba(187, 217, 119, 0.3)',
                  borderRadius: '16px',
                  cursor: 'default',
                  opacity: 0.8,
                  transition: 'all 0.3s ease',
                  '&:hover': {
                    transform: 'translateY(-2px)',
                    boxShadow: '0 4px 12px rgba(187, 217, 119, 0.2)',
                  },
                }}
              >
                <CardContent sx={{ p: 3 }}>
                  <Stack direction="row" spacing={2} alignItems="flex-start" mb={2}>
                    <Typography variant="h2">{pack.icon}</Typography>
                    <Box flex={1}>
                      <Stack direction="row" spacing={1} alignItems="center" mb={1}>
                        <Typography variant="h6" fontWeight="bold">
                          {pack.name}
                        </Typography>
                        <PremiumIcon sx={{ color: 'rgba(187, 217, 119, 0.9)', fontSize: 20 }} />
                      </Stack>
                      <Typography variant="body2" color="text.secondary" mb={2}>
                        {pack.description}
                      </Typography>
                      <Stack direction="row" spacing={1} flexWrap="wrap" mb={2}>
                        {pack.agentIds.slice(0, 3).map((agentId, idx) => {
                          const formattedName = agentId
                            .split('-')
                            .map((w) => {
                              return w.charAt(0).toUpperCase() + w.slice(1);
                            })
                            .join(' ');
                          return (
                            <Chip
                              key={idx}
                              label={formattedName}
                              size="small"
                              variant="outlined"
                              sx={{ borderColor: 'rgba(187, 217, 119, 0.4)', color: 'rgba(187, 217, 119, 0.9)' }}
                            />
                          );
                        })}
                        {pack.agentIds.length > 3 ? (
                          <Chip
                            label={`+${pack.agentIds.length - 3} more`}
                            size="small"
                            variant="outlined"
                            sx={{ borderColor: 'rgba(187, 217, 119, 0.3)', color: 'rgba(187, 217, 119, 0.7)' }}
                          />
                        ) : null}
                      </Stack>
                      <Stack direction="row" spacing={2} alignItems="center">
                        <Chip
                          icon={<ConstructionIcon sx={{ color: 'rgba(187, 217, 119, 0.7)' }} />}
                          label="Coming Soon"
                          variant="outlined"
                          sx={{
                            fontWeight: 600,
                            borderColor: 'rgba(187, 217, 119, 0.5)',
                            color: 'rgba(187, 217, 119, 0.9)',
                            '& .MuiChip-icon': { color: 'rgba(187, 217, 119, 0.7)' }
                          }}
                        />
                        <Typography variant="caption" color="text.secondary">
                          {pack.agentIds.length} agents included
                        </Typography>
                      </Stack>
                    </Box>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </TabPanel>

      {/* My Agents Tab */}
      <TabPanel value={tabValue} index={3}>
        {pinnedAgents.length === 0 ? (
          <Box
            sx={{
              textAlign: 'center',
              py: 8,
              px: 3,
              backgroundColor: 'rgba(255, 255, 255, 0.02)',
              borderRadius: '16px',
              border: '1px dashed rgba(255, 255, 255, 0.1)',
            }}
          >
            <StarIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
            <Typography variant="h6" gutterBottom>
              No Pinned Agents Yet
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Click the star icon on any agent card to pin it here for quick access
            </Typography>
          </Box>
        ) : (
          <Grid container spacing={3}>
            {filteredAgents.filter(a => pinnedAgents.includes(a.slug)).map((agent) => (
              <Grid item xs={12} sm={6} md={4} key={agent.id}>
                {/* Same agent card as in All Agents tab */}
                <Card
                  sx={{
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    cursor: 'pointer',
                    transition: 'all 0.3s ease',
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '16px',
                    '&:hover': {
                      transform: 'translateY(-4px)',
                      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)',
                      borderColor: 'primary.main',
                    },
                  }}
                  onClick={() => handleAgentClick(agent.slug)}
                >
                  <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', p: 3 }}>
                    <Stack direction="row" spacing={2} alignItems="center" mb={2}>
                      <Box
                        sx={{
                          fontSize: '48px',
                          width: '64px',
                          height: '64px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: 2,
                          backgroundColor: 'rgba(187, 217, 119, 0.1)',
                        }}
                      >
                        {agent.icon}
                      </Box>
                      <Box flex={1}>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Typography variant="h6" fontWeight="bold">
                            {agent.name}
                          </Typography>
                          <StarIcon sx={{ color: '#FFD700', fontSize: 20 }} />
                        </Stack>
                        <Chip
                          label={agent.category}
                          size="small"
                          sx={{
                            backgroundColor: getCategoryColor(agent.category),
                            color: 'white',
                            textTransform: 'capitalize',
                            mt: 0.5,
                          }}
                        />
                      </Box>
                    </Stack>

                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{
                        flex: 1,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {agent.description}
                    </Typography>

                    <Box mt={2}>
                      <Typography
                        variant="button"
                        color="primary"
                        sx={{ fontWeight: 'bold' }}
                      >
                        RUN AGENT →
                      </Typography>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}
      </TabPanel>

      {/* Coming Soon Section - Show on all tabs except My Agents */}
      {tabValue !== 3 && (
        <Box 
          mt={4} 
          p={3} 
          sx={{ 
            backgroundColor: 'rgba(255, 255, 255, 0.05)', 
            borderRadius: '12px',
            border: '1px solid rgba(255, 255, 255, 0.1)',
          }}
        >
          <Typography variant="h6" fontWeight="bold" gutterBottom>
            ✨ More Agents Coming Soon
          </Typography>
          <Typography variant="body2" color="text.secondary">
            We're continuously expanding our agent library. Custom agent builder and 
            pack creator tools are also in development. Stay tuned!
          </Typography>
        </Box>
      )}
    </Box>
  );
};
