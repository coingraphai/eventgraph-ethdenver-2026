import Plotly from 'plotly.js-basic-dist';
// @ts-ignore
import * as PlotlyFactory from 'react-plotly.js/factory';

const createPlotlyComponent = PlotlyFactory.default || PlotlyFactory;
const Plot = createPlotlyComponent(Plotly);

export default Plot;
