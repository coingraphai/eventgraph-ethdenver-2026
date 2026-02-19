import { Box, Typography, List, ListItem, ListItemText, Chip, alpha, useTheme } from '@mui/material';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';

interface Category {
  name: string;
  count: number;
}

interface TrendingCategoriesProps {
  categories: Category[];
}

export const TrendingCategories = ({ categories }: TrendingCategoriesProps) => {
  const theme = useTheme();

  const topCategories = categories.slice(0, 8);
  const maxCount = Math.max(...topCategories.map(c => c.count));

  return (
    <Box sx={{ height: 380, display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <LocalFireDepartmentIcon sx={{ color: theme.palette.primary.main, mr: 1, fontSize: 24 }} />
        <Typography
          variant="h6"
          sx={{
            fontWeight: 600,
          }}
        >
          Trending Categories
        </Typography>
      </Box>
      <List sx={{ p: 0, flex: 1, overflow: 'auto' }}>
        {topCategories.map((category, index) => {
          const percentage = (category.count / maxCount) * 100;
          return (
            <ListItem
              key={index}
              sx={{
                px: 0,
                py: 1.5,
                borderBottom: index < topCategories.length - 1 ? `1px solid ${alpha(theme.palette.divider, 0.1)}` : 'none',
                position: 'relative',
                overflow: 'hidden',
                '&::before': {
                  content: '""',
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: `${percentage}%`,
                  background: alpha(theme.palette.primary.main, 0.1),
                  transition: 'width 0.3s ease',
                  zIndex: 0,
                },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', position: 'relative', zIndex: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography
                    variant="caption"
                    sx={{
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      background: alpha(theme.palette.primary.main, 0.2),
                      color: theme.palette.primary.light,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: '0.7rem',
                    }}
                  >
                    {index + 1}
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 500, textTransform: 'capitalize' }}>
                    {category.name}
                  </Typography>
                </Box>
                <Chip
                  label={`${category.count} markets`}
                  size="small"
                  sx={{
                    background: alpha(theme.palette.primary.main, 0.15),
                    color: theme.palette.primary.light,
                    fontSize: '0.7rem',
                    height: 24,
                    fontWeight: 600,
                  }}
                />
              </Box>
            </ListItem>
          );
        })}
      </List>
    </Box>
  );
};
