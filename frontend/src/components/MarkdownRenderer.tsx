import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Box, Paper, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';

// Styled components for markdown elements
const StyledMarkdown = styled(Box)(({ theme }) => ({
  '& p': {
    margin: '0.75em 0',
    lineHeight: 1.6,
    color: theme.palette.text.primary,
    fontSize: '15px',
  },
  '& p:first-of-type': {
    marginTop: 0,
  },
  '& p:last-of-type': {
    marginBottom: 0,
  },
  '& strong': {
    fontWeight: 700,
    color: theme.palette.text.primary,
  },
  '& em': {
    fontStyle: 'italic',
    color: theme.palette.text.secondary,
  },
  '& h1, & h2, & h3, & h4, & h5, & h6': {
    fontWeight: 600,
    marginTop: '1.5em',
    marginBottom: '0.75em',
    lineHeight: 1.3,
    color: theme.palette.text.primary,
  },
  '& h1': {
    fontSize: '24px',
    borderBottom: `2px solid ${theme.palette.divider}`,
    paddingBottom: '0.3em',
  },
  '& h2': {
    fontSize: '20px',
    borderBottom: `1px solid ${theme.palette.divider}`,
    paddingBottom: '0.3em',
  },
  '& h3': {
    fontSize: '18px',
  },
  '& h4': {
    fontSize: '16px',
  },
  '& h5, & h6': {
    fontSize: '15px',
  },
  '& ul, & ol': {
    marginLeft: '1.5em',
    marginTop: '0.5em',
    marginBottom: '0.5em',
  },
  '& li': {
    marginBottom: '0.25em',
    color: theme.palette.text.primary,
    lineHeight: 1.6,
  },
  '& li > p': {
    margin: '0.25em 0',
  },
  '& blockquote': {
    margin: '1em 0',
    padding: '0.5em 1em',
    borderLeft: `4px solid ${theme.palette.primary.main}`,
    backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
    borderRadius: '4px',
    color: theme.palette.text.secondary,
    fontStyle: 'italic',
  },
  '& code': {
    backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.06)',
    padding: '0.2em 0.4em',
    borderRadius: '4px',
    fontSize: '0.9em',
    fontFamily: '"Fira Code", "Consolas", "Monaco", monospace',
    color: theme.palette.mode === 'dark' ? '#e06c75' : '#c7254e',
  },
  '& pre': {
    margin: '1em 0',
    padding: '1em',
    backgroundColor: theme.palette.mode === 'dark' ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.05)',
    borderRadius: '8px',
    overflow: 'auto',
    border: `1px solid ${theme.palette.divider}`,
  },
  '& pre code': {
    backgroundColor: 'transparent',
    padding: 0,
    fontSize: '13px',
    lineHeight: 1.5,
    color: theme.palette.text.primary,
  },
  '& a': {
    color: theme.palette.primary.main,
    textDecoration: 'none',
    borderBottom: `1px solid ${theme.palette.primary.main}40`,
    transition: 'border-color 0.2s',
    '&:hover': {
      borderBottomColor: theme.palette.primary.main,
    },
  },
  '& hr': {
    border: 'none',
    borderTop: `1px solid ${theme.palette.divider}`,
    margin: '2em 0',
  },
  '& table': {
    width: '100%',
    borderCollapse: 'separate',
    borderSpacing: 0,
    margin: '1.5em 0',
    fontSize: '14px',
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: '8px',
    overflow: 'hidden',
    boxShadow: theme.palette.mode === 'dark' ? '0 2px 8px rgba(0,0,0,0.3)' : '0 2px 8px rgba(0,0,0,0.1)',
  },
  '& thead': {
    backgroundColor: theme.palette.mode === 'dark' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.08)',
  },
  '& th': {
    padding: '14px 16px',
    textAlign: 'left',
    fontWeight: 700,
    fontSize: '13px',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    borderBottom: `2px solid ${theme.palette.primary.main}`,
    color: theme.palette.mode === 'dark' ? theme.palette.primary.light : theme.palette.primary.dark,
    whiteSpace: 'nowrap',
    '&:not(:last-child)': {
      borderRight: `1px solid ${theme.palette.divider}`,
    },
  },
  '& td': {
    padding: '12px 16px',
    borderBottom: `1px solid ${theme.palette.divider}`,
    color: theme.palette.text.primary,
    lineHeight: 1.6,
    '&:not(:last-child)': {
      borderRight: `1px solid ${theme.palette.divider}`,
    },
  },
  '& tbody tr': {
    transition: 'background-color 0.15s',
    backgroundColor: theme.palette.mode === 'dark' ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.8)',
    '&:hover': {
      backgroundColor: theme.palette.mode === 'dark' ? 'rgba(59, 130, 246, 0.08)' : 'rgba(59, 130, 246, 0.05)',
    },
    '&:nth-of-type(even)': {
      backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)',
    },
    '&:last-child td': {
      borderBottom: 'none',
    },
  },
  '& img': {
    maxWidth: '100%',
    height: 'auto',
    borderRadius: '8px',
    margin: '1em 0',
  },
}));

interface MarkdownRendererProps {
  content: string;
}

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  return (
    <StyledMarkdown>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Custom rendering for code blocks
          code({ className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || '');
            const inline = !className;
            return !inline ? (
              <Box
                component="pre"
                sx={{
                  position: 'relative',
                }}
              >
                {match && (
                  <Typography
                    sx={{
                      position: 'absolute',
                      top: 8,
                      right: 8,
                      fontSize: '11px',
                      textTransform: 'uppercase',
                      color: 'text.secondary',
                      backgroundColor: 'background.paper',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontWeight: 600,
                    }}
                  >
                    {match[1]}
                  </Typography>
                )}
                <code className={className} {...props}>
                  {children}
                </code>
              </Box>
            ) : (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
          // Custom rendering for tables with better styling
          table({ children }) {
            return (
              <Paper
                elevation={2}
                sx={{
                  overflow: 'hidden',
                  borderRadius: '12px',
                  my: 3,
                  border: (theme) => `1px solid ${theme.palette.divider}`,
                  background: (theme) => 
                    theme.palette.mode === 'dark' 
                      ? 'linear-gradient(145deg, rgba(30,30,30,0.95) 0%, rgba(20,20,20,0.95) 100%)'
                      : 'linear-gradient(145deg, rgba(255,255,255,0.95) 0%, rgba(250,250,250,0.95) 100%)',
                }}
              >
                <Box sx={{ 
                  overflowX: 'auto',
                  '&::-webkit-scrollbar': {
                    height: '8px',
                  },
                  '&::-webkit-scrollbar-track': {
                    backgroundColor: (theme) => 
                      theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.05)',
                  },
                  '&::-webkit-scrollbar-thumb': {
                    backgroundColor: (theme) => 
                      theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)',
                    borderRadius: '4px',
                    '&:hover': {
                      backgroundColor: (theme) => 
                        theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)',
                    },
                  },
                }}>
                  <table>{children}</table>
                </Box>
              </Paper>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </StyledMarkdown>
  );
};

export default MarkdownRenderer;
