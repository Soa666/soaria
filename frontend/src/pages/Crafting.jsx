import { useState, useEffect } from 'react';
import api from '../services/api';
import './Crafting.css';

function Crafting() {
  const [recipes, setRecipes] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchRecipes();
    fetchInventory();
  }, []);

  const fetchRecipes = async () => {
    try {
      const response = await api.get('/crafting/recipes');
      setRecipes(response.data.recipes);
    } catch (error) {
      console.error('Fehler beim Laden der Rezepte:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchInventory = async () => {
    try {
      const response = await api.get('/inventory');
      setInventory(response.data.inventory);
    } catch (error) {
      console.error('Fehler beim Laden des Inventars:', error);
    }
  };

  const craftItem = async (recipeId) => {
    try {
      const response = await api.post('/crafting/craft', { recipe_id: recipeId });
      setMessage(response.data.message);
      setTimeout(() => setMessage(''), 3000);
      fetchInventory();
    } catch (error) {
      setMessage(error.response?.data?.error || 'Fehler beim Craften');
      setTimeout(() => setMessage(''), 3000);
    }
  };

  const hasEnoughItems = (ingredients) => {
    return ingredients.every(ing => {
      const invItem = inventory.find(inv => inv.item_id === ing.item_id);
      return invItem && invItem.quantity >= ing.quantity;
    });
  };

  const getImageUrl = (imagePath) => {
    if (!imagePath) {
      return '/placeholder-item.png';
    }
    if (imagePath.startsWith('http')) {
      return imagePath;
    }
    return `/items/${imagePath}`;
  };

  if (loading) {
    return <div className="loading">Lädt...</div>;
  }

  return (
    <div className="container">
      <div className="card">
        <h1>Crafting</h1>
        {message && <div className={message.includes('Fehler') ? 'error' : 'success'}>{message}</div>}
        
        {recipes.length === 0 ? (
          <p>Keine Rezepte verfügbar.</p>
        ) : (
          <div className="crafting-grid">
            {recipes.map((recipe) => {
              const canCraft = hasEnoughItems(recipe.ingredients);
              return (
                <div key={recipe.id} className="crafting-recipe-card">
                  <div className="recipe-result">
                    <div className="item-image-container">
                      <img
                        src={getImageUrl(recipe.result_image_path)}
                        alt={recipe.result_display_name}
                        className="item-image"
                        onError={(e) => {
                          e.target.src = '/placeholder-item.png';
                        }}
                      />
                      {recipe.result_quantity > 1 && (
                        <div className="item-quantity-badge">{recipe.result_quantity}x</div>
                      )}
                    </div>
                    <div className="recipe-info">
                      <h3>{recipe.result_display_name}</h3>
                      <p className={`rarity-${recipe.result_rarity}`}>{recipe.result_rarity}</p>
                      <p className="workbench-level">Werkbank-Level: {recipe.required_workbench_level}</p>
                    </div>
                  </div>
                  
                  <div className="recipe-ingredients">
                    <strong>Zutaten:</strong>
                    <div className="ingredients-list">
                      {recipe.ingredients.map((ing, idx) => {
                        const invItem = inventory.find(inv => inv.item_id === ing.item_id);
                        const hasEnough = invItem && invItem.quantity >= ing.quantity;
                        return (
                          <div key={idx} className={`ingredient-item ${hasEnough ? '' : 'missing'}`}>
                            <div className="ingredient-image-container">
                              <img
                                src={getImageUrl(ing.image_path)}
                                alt={ing.display_name}
                                className="ingredient-image"
                                onError={(e) => {
                                  e.target.src = '/placeholder-item.png';
                                }}
                              />
                            </div>
                            <div className="ingredient-info">
                              <span className="ingredient-name">{ing.display_name}</span>
                              <span className="ingredient-quantity">
                                {ing.quantity}x
                                {invItem && (
                                  <span className={`inv-quantity ${hasEnough ? '' : 'insufficient'}`}>
                                    ({invItem.quantity}/{ing.quantity})
                                  </span>
                                )}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  
                  <button
                    className={`btn ${canCraft ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => craftItem(recipe.id)}
                    disabled={!canCraft}
                  >
                    {canCraft ? 'Craften' : 'Nicht genug Materialien'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default Crafting;
