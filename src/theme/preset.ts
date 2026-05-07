import { definePreset } from '@primevue/themes'
import Aura from '@primevue/themes/aura'

// Inform teal palette (#0090a7), mirrors dashboard-single-page-application.
export const InformPreset = definePreset(Aura, {
  semantic: {
    primary: {
      0: '#e6f4f6',
      50: '#cce9ed',
      100: '#99d3dc',
      200: '#66bcca',
      300: '#33a6b9',
      400: '#0090a7',
      500: '#007386',
      600: '#005664',
      700: '#003a43',
      800: '#001d21',
      900: '#001317',
      950: '#00090b',
    },
  },
  components: {
    menubar: {
      background: '#0090a7',
      borderColor: '#0090a7',
    },
  },
})
